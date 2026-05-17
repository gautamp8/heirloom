import { promises as fs } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import argon2 from "argon2";
import type { Session } from "./auth";
import { sqlAdmin, vec } from "./db";
import { resolveBlob } from "./storage";

/**
 * .hloom v2 wire format. A UTF-8 JSON envelope wrapping base64
 * ciphertext that AEAD-decrypts to a gzipped JSON payload of the full
 * vault (rows + blobs).
 *
 *   { magic: "HLOOM", version: 2,
 *     kdf:    { type: "argon2id", salt, memory_kib, time, parallelism },
 *     cipher: { type: "chacha20-poly1305", nonce, aad },
 *     ciphertext, tag, meta }
 *
 * v2 normalizes vector columns to `number[]` so bundles round-trip
 * across Postgres (pgvector text) and SQLite (Float32LE BLOB). v1
 * bundles still decrypt, but their embeddings were pgvector strings
 * and only re-import cleanly on Postgres.
 */

const MAGIC = "HLOOM";
const VERSION = 2;
const ARGON2_PARAMS = { memoryCost: 64 * 1024, timeCost: 3, parallelism: 4 };
const KEY_LEN = 32;
const NONCE_LEN = 12;
const TAG_LEN = 16;

type Row = Record<string, unknown>;

type VaultPlaintext = {
  manifest: {
    exported_at: string;
    creator_user_id: string;
    vault_id: string;
    counts: Record<string, number>;
    schema_version: number;
  };
  rows: {
    users: Row[];
    vault: Row | null;
    captures: Row[];
    transcripts: Row[];
    transcript_chunks: Row[];
    capture_tags: Row[];
    nominees: Row[];
    nominee_releases: Row[];
    executor_credentials: Row[];
    people: Row[];
    face_appearances: Row[];
    life_events: Row[];
    sealed_letters: Row[];
    voice_profiles: Row[];
  };
  blobs: { [blob_url: string]: string };
};

export type ExportResult = {
  filename: string;
  bytes: Buffer;
  passphrase_used: boolean;
};

/** Normalize whatever an embedding column comes back as on each backend
 *  to a plain `number[]`. Postgres pgvector → text `[a,b,c]`; SQLite
 *  → Float32LE Buffer; arrays passed through. */
function decodeEmbedding(raw: unknown): number[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try {
      const arr = JSON.parse(raw) as unknown;
      return Array.isArray(arr) ? (arr as number[]) : null;
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
    const buf = Buffer.isBuffer(raw)
      ? raw
      : Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
    const n = Math.floor(buf.length / 4);
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) out[i] = buf.readFloatLE(i * 4);
    return out;
  }
  return null;
}

/** Mutate `row[field]` in place to a `number[]` (or null) and return
 *  the row, ready to be JSON.stringified into the bundle. */
function normEmbed(row: Row, field: string): Row {
  if (field in row) row[field] = decodeEmbedding(row[field]);
  return row;
}

/** Convert `conditions` JSONB to a plain object - Postgres returns it
 *  already parsed, SQLite returns it as a JSON string. */
function decodeJson(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

export async function exportVault(
  session: Session,
  passphrase: string,
): Promise<ExportResult> {
  if (session.role !== "creator") throw new Error("creator_only");
  if (!sqlAdmin) throw new Error("admin_db_unavailable");
  if (!passphrase || passphrase.trim().length < 6) {
    throw new Error("passphrase_too_short");
  }

  const vault_id = session.vault_id;

  const captures = await sqlAdmin<Row[]>`
    SELECT * FROM captures WHERE vault_id = ${vault_id}
  `;
  const transcripts = await sqlAdmin<Row[]>`
    SELECT t.* FROM transcripts t
      JOIN captures c ON c.id = t.capture_id
     WHERE c.vault_id = ${vault_id}
  `;
  const chunks = (await sqlAdmin<Row[]>`
    SELECT * FROM transcript_chunks WHERE vault_id = ${vault_id}
  `).map((r) => normEmbed(r, "embedding"));
  const tags = await sqlAdmin<Row[]>`
    SELECT ct.* FROM capture_tags ct
      JOIN captures c ON c.id = ct.capture_id
     WHERE c.vault_id = ${vault_id}
  `;
  const nominees = await sqlAdmin<Row[]>`
    SELECT * FROM nominees WHERE vault_id = ${vault_id}
  `;
  const nominee_releases = await sqlAdmin<Row[]>`
    SELECT * FROM nominee_releases WHERE vault_id = ${vault_id}
  `;
  const executor_credentials = await sqlAdmin<Row[]>`
    SELECT * FROM executor_credentials WHERE vault_id = ${vault_id}
  `;
  const people = (await sqlAdmin<Row[]>`
    SELECT * FROM people WHERE vault_id = ${vault_id}
  `).map((r) => normEmbed(r, "reference_embedding"));
  const face_appearances = (await sqlAdmin<Row[]>`
    SELECT * FROM face_appearances WHERE vault_id = ${vault_id}
  `).map((r) => {
    normEmbed(r, "embedding");
    r.bbox = decodeJson(r.bbox);
    return r;
  });
  const life_events = (await sqlAdmin<Row[]>`
    SELECT * FROM life_events WHERE vault_id = ${vault_id}
  `).map((r) => normEmbed(r, "embedding"));
  const sealed_letters = (await sqlAdmin<Row[]>`
    SELECT * FROM sealed_letters WHERE vault_id = ${vault_id}
  `).map((r) => {
    normEmbed(r, "intent_embedding");
    r.conditions = decodeJson(r.conditions);
    return r;
  });
  const voice_profiles = await sqlAdmin<Row[]>`
    SELECT * FROM voice_profiles WHERE vault_id = ${vault_id}
  `;
  const [vault] = await sqlAdmin<Row[]>`
    SELECT * FROM vaults WHERE id = ${vault_id}
  `;
  const users = await sqlAdmin<Row[]>`
    SELECT u.* FROM users u
      JOIN vaults v ON v.creator_id = u.id
     WHERE v.id = ${vault_id}
  `;

  // Read every referenced blob (capture media + voice reference audio).
  const blobs: { [k: string]: string } = {};
  const blobUrls = new Set<string>();
  for (const c of captures) {
    const u = c.blob_url as string | null;
    if (u) blobUrls.add(u);
  }
  for (const vp of voice_profiles) {
    const u = vp.blob_url as string | null;
    if (u) blobUrls.add(u);
  }
  for (const url of blobUrls) {
    try {
      const data = await fs.readFile(resolveBlob(url));
      blobs[url] = data.toString("base64");
    } catch (e) {
      console.warn("[export] missing blob", url, e);
    }
  }

  const plaintext: VaultPlaintext = {
    manifest: {
      exported_at: new Date().toISOString(),
      creator_user_id: session.user_id,
      vault_id,
      schema_version: VERSION,
      counts: {
        captures: captures.length,
        transcripts: transcripts.length,
        chunks: chunks.length,
        tags: tags.length,
        nominees: nominees.length,
        nominee_releases: nominee_releases.length,
        executor_credentials: executor_credentials.length,
        people: people.length,
        face_appearances: face_appearances.length,
        life_events: life_events.length,
        sealed_letters: sealed_letters.length,
        voice_profiles: voice_profiles.length,
        blobs: Object.keys(blobs).length,
      },
    },
    rows: {
      users,
      vault: vault ?? null,
      captures,
      transcripts,
      transcript_chunks: chunks,
      capture_tags: tags,
      nominees,
      nominee_releases,
      executor_credentials,
      people,
      face_appearances,
      life_events,
      sealed_letters,
      voice_profiles,
    },
    blobs,
  };

  const compressed = gzipSync(Buffer.from(JSON.stringify(plaintext)));
  const salt = randomBytes(16);
  const nonce = randomBytes(NONCE_LEN);
  const aad = Buffer.from(`heirloom/v${VERSION}/${vault_id}`);

  const key = (await argon2.hash(passphrase.trim(), {
    type: argon2.argon2id,
    salt,
    memoryCost: ARGON2_PARAMS.memoryCost,
    timeCost: ARGON2_PARAMS.timeCost,
    parallelism: ARGON2_PARAMS.parallelism,
    hashLength: KEY_LEN,
    raw: true,
  })) as unknown as Buffer;

  const cipher = createCipheriv("chacha20-poly1305", key, nonce, {
    authTagLength: TAG_LEN,
  });
  cipher.setAAD(aad, { plaintextLength: compressed.length });
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope = {
    magic: MAGIC,
    version: VERSION,
    kdf: {
      type: "argon2id",
      salt: salt.toString("base64"),
      memory_kib: ARGON2_PARAMS.memoryCost,
      time: ARGON2_PARAMS.timeCost,
      parallelism: ARGON2_PARAMS.parallelism,
      hash_length: KEY_LEN,
    },
    cipher: {
      type: "chacha20-poly1305",
      nonce: nonce.toString("base64"),
      aad: aad.toString("base64"),
    },
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
    meta: plaintext.manifest,
  };

  const bytes = Buffer.from(JSON.stringify(envelope));
  const fname = `heirloom-${vault_id.slice(0, 8)}-${new Date()
    .toISOString()
    .slice(0, 10)}.hloom`;
  return { filename: fname, bytes, passphrase_used: true };
}

export type ImportSummary = {
  vault_id: string;
  counts: Record<string, number>;
};

export async function importVault(
  envelopeBytes: Buffer,
  passphrase: string,
  session: Session,
): Promise<ImportSummary> {
  if (session.role !== "creator") throw new Error("creator_only");
  if (!sqlAdmin) throw new Error("admin_db_unavailable");
  if (!passphrase || passphrase.trim().length < 6) {
    throw new Error("passphrase_too_short");
  }

  const env = JSON.parse(envelopeBytes.toString("utf8")) as {
    magic: string;
    version: number;
    kdf: {
      type: string;
      salt: string;
      memory_kib: number;
      time: number;
      parallelism: number;
      hash_length: number;
    };
    cipher: { type: string; nonce: string; aad: string };
    ciphertext: string;
    tag: string;
  };
  if (env.magic !== MAGIC) throw new Error("not_a_heirloom_bundle");
  if (env.version !== 1 && env.version !== 2) {
    throw new Error("unsupported_version");
  }
  if (env.kdf.type !== "argon2id" || env.cipher.type !== "chacha20-poly1305") {
    throw new Error("unsupported_algorithm");
  }

  const salt = Buffer.from(env.kdf.salt, "base64");
  const nonce = Buffer.from(env.cipher.nonce, "base64");
  const aad = Buffer.from(env.cipher.aad, "base64");
  const ciphertext = Buffer.from(env.ciphertext, "base64");
  const tag = Buffer.from(env.tag, "base64");

  const key = (await argon2.hash(passphrase.trim(), {
    type: argon2.argon2id,
    salt,
    memoryCost: env.kdf.memory_kib,
    timeCost: env.kdf.time,
    parallelism: env.kdf.parallelism,
    hashLength: env.kdf.hash_length,
    raw: true,
  })) as unknown as Buffer;

  let compressed: Buffer;
  try {
    const decipher = createDecipheriv("chacha20-poly1305", key, nonce, {
      authTagLength: TAG_LEN,
    });
    decipher.setAAD(aad, { plaintextLength: ciphertext.length });
    decipher.setAuthTag(tag);
    compressed = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
  } catch {
    throw new Error("decryption_failed_wrong_passphrase_or_tampered");
  }

  const plaintext = JSON.parse(
    gunzipSync(compressed).toString("utf8"),
  ) as VaultPlaintext;

  // Tables that v1 didn't carry are gracefully treated as empty.
  const rows = {
    users: plaintext.rows.users ?? [],
    vault: plaintext.rows.vault ?? null,
    captures: plaintext.rows.captures ?? [],
    transcripts: plaintext.rows.transcripts ?? [],
    transcript_chunks: plaintext.rows.transcript_chunks ?? [],
    capture_tags: plaintext.rows.capture_tags ?? [],
    nominees: plaintext.rows.nominees ?? [],
    nominee_releases: plaintext.rows.nominee_releases ?? [],
    executor_credentials: plaintext.rows.executor_credentials ?? [],
    people: plaintext.rows.people ?? [],
    face_appearances: plaintext.rows.face_appearances ?? [],
    life_events: plaintext.rows.life_events ?? [],
    sealed_letters: plaintext.rows.sealed_letters ?? [],
    voice_profiles: plaintext.rows.voice_profiles ?? [],
  };

  // Wipe everything in the target vault that we're about to overwrite.
  // Order respects FK cascades: child rows first, then parents.
  await sqlAdmin.begin(async (tx) => {
    await tx`DELETE FROM voice_profiles      WHERE vault_id = ${session.vault_id}`;
    await tx`DELETE FROM executor_credentials WHERE vault_id = ${session.vault_id}`;
    await tx`DELETE FROM sealed_letters      WHERE vault_id = ${session.vault_id}`;
    await tx`DELETE FROM life_events         WHERE vault_id = ${session.vault_id}`;
    await tx`DELETE FROM face_appearances    WHERE vault_id = ${session.vault_id}`;
    await tx`DELETE FROM nominee_releases    WHERE vault_id = ${session.vault_id}`;
    // captures cascade clears transcripts, transcript_chunks, capture_tags.
    await tx`DELETE FROM captures            WHERE vault_id = ${session.vault_id}`;
    await tx`DELETE FROM people              WHERE vault_id = ${session.vault_id}`;
    await tx`DELETE FROM nominees            WHERE vault_id = ${session.vault_id}`;
  });

  const counts: Record<string, number> = {};

  await sqlAdmin.begin(async (tx) => {
    // 1) Blobs land in the storage tree under fresh names.
    const blobNameMap: Record<string, string> = {};
    for (const [oldUrl, b64] of Object.entries(plaintext.blobs ?? {})) {
      const ext = oldUrl.split(".").pop() ?? "bin";
      const newName = `imported-${randomBytes(8).toString("hex")}.${ext}`;
      const newUrl = `storage/blobs/${newName}`;
      await fs.writeFile(resolveBlob(newUrl), Buffer.from(b64, "base64"));
      blobNameMap[oldUrl] = newUrl;
    }
    counts.blobs = Object.keys(blobNameMap).length;

    // 2) Nominees first - people/sealed_letters/executor_credentials/
    //    nominee_releases all FK into nominees.
    const nomIdMap: Record<string, string> = {};
    for (const n of rows.nominees as {
      id: string;
      name: string;
      relationship: string | null;
      email: string | null;
      role: string;
      letter_body: string | null;
      passphrase_hash: string | null;
      passphrase_set_at: string | null;
    }[]) {
      // user_id is intentionally NULLed - the original nominee's account
      // may not exist in this instance. They reclaim from the nominee
      // sign-in flow on their next visit.
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO nominees (vault_id, user_id, name, relationship, email,
                              role, letter_body, passphrase_hash, passphrase_set_at)
        VALUES (${session.vault_id}, NULL, ${n.name}, ${n.relationship},
                ${n.email}, ${n.role}, ${n.letter_body},
                ${n.passphrase_hash}, ${n.passphrase_set_at})
        RETURNING id
      `;
      nomIdMap[n.id] = row.id;
    }
    counts.nominees = Object.keys(nomIdMap).length;

    // 3) Captures.
    const capIdMap: Record<string, string> = {};
    for (const c of rows.captures as {
      id: string;
      kind: string;
      status: string;
      title: string | null;
      caption: string | null;
      body: string | null;
      blob_url: string | null;
      duration_ms: number | null;
      captured_at: string;
      is_profile?: number | boolean | null;
    }[]) {
      const isProfile =
        c.is_profile === true || c.is_profile === 1 ? true : false;
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO captures (vault_id, kind, status, title, caption, body,
                              blob_url, duration_ms, captured_at, is_profile)
        VALUES (${session.vault_id}, ${c.kind}, ${c.status}, ${c.title},
                ${c.caption}, ${c.body},
                ${c.blob_url ? blobNameMap[c.blob_url] ?? null : null},
                ${c.duration_ms}, ${c.captured_at}, ${isProfile})
        RETURNING id
      `;
      capIdMap[c.id] = row.id;
    }
    counts.captures = Object.keys(capIdMap).length;

    // 4) Transcripts.
    for (const t of rows.transcripts as {
      capture_id: string;
      text: string;
      language: string | null;
      word_timestamps: unknown;
    }[]) {
      const nid = capIdMap[t.capture_id];
      if (!nid) continue;
      const wts = decodeJson(t.word_timestamps);
      await tx`
        INSERT INTO transcripts (capture_id, text, language, word_timestamps)
        VALUES (${nid}, ${t.text}, ${t.language ?? "en"},
                ${wts == null ? null : (JSON.stringify(wts) as unknown as string)})
      `;
    }
    counts.transcripts = rows.transcripts.length;

    // 5) Chunks. Embedding is v2 number[] or v1 pgvector text.
    let chunkCount = 0;
    for (const ch of rows.transcript_chunks as {
      capture_id: string;
      chunk_index: number;
      text: string;
      embedding: unknown;
      start_ms: number | null;
      end_ms: number | null;
    }[]) {
      const nid = capIdMap[ch.capture_id];
      if (!nid) continue;
      const arr = decodeEmbedding(ch.embedding);
      if (!arr) continue;
      await tx`
        INSERT INTO transcript_chunks
          (capture_id, vault_id, chunk_index, text, embedding, start_ms, end_ms)
        VALUES (${nid}, ${session.vault_id}, ${ch.chunk_index}, ${ch.text},
                ${vec(arr)}, ${ch.start_ms}, ${ch.end_ms})
      `;
      chunkCount++;
    }
    counts.chunks = chunkCount;

    // 6) Tags.
    for (const t of rows.capture_tags as {
      capture_id: string;
      kind: string;
      value: string;
      confidence: number | null;
    }[]) {
      const nid = capIdMap[t.capture_id];
      if (!nid) continue;
      await tx`
        INSERT INTO capture_tags (capture_id, kind, value, confidence)
        VALUES (${nid}, ${t.kind}, ${t.value}, ${t.confidence})
        ON CONFLICT DO NOTHING
      `;
    }
    counts.tags = rows.capture_tags.length;

    // 7) People. nominee_id remapped.
    const peopleIdMap: Record<string, string> = {};
    for (const p of rows.people as {
      id: string;
      display_name: string | null;
      relation: string | null;
      user_id: string | null;
      nominee_id: string | null;
      reference_embedding: unknown;
      appearance_count: number | null;
      confirmed: boolean | number | null;
    }[]) {
      const refArr = decodeEmbedding(p.reference_embedding);
      const mappedNominee = p.nominee_id ? nomIdMap[p.nominee_id] ?? null : null;
      // user_id stays the original creator's id if it matches the source,
      // else NULL. After import the only safe self-link is the importing
      // user.
      const mappedUserId =
        p.user_id === plaintext.manifest.creator_user_id
          ? session.user_id
          : null;
      const confirmed = !!(p.confirmed === true || p.confirmed === 1);
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO people (vault_id, display_name, relation, user_id,
                            nominee_id, reference_embedding, appearance_count,
                            confirmed)
        VALUES (${session.vault_id}, ${p.display_name}, ${p.relation},
                ${mappedUserId}, ${mappedNominee},
                ${refArr ? vec(refArr) : null}, ${p.appearance_count ?? 0},
                ${confirmed})
        RETURNING id
      `;
      peopleIdMap[p.id] = row.id;
    }
    counts.people = Object.keys(peopleIdMap).length;

    // 8) Face appearances.
    let faceCount = 0;
    for (const f of rows.face_appearances as {
      capture_id: string;
      person_id: string | null;
      bbox: unknown;
      embedding: unknown;
      similarity: number | null;
      confirmed: boolean | number | null;
    }[]) {
      const nid = capIdMap[f.capture_id];
      if (!nid) continue;
      const arr = decodeEmbedding(f.embedding);
      if (!arr) continue;
      const bbox = decodeJson(f.bbox);
      const mappedPerson = f.person_id ? peopleIdMap[f.person_id] ?? null : null;
      const confirmed = !!(f.confirmed === true || f.confirmed === 1);
      await tx`
        INSERT INTO face_appearances (capture_id, vault_id, person_id, bbox,
                                      embedding, similarity, confirmed)
        VALUES (${nid}, ${session.vault_id}, ${mappedPerson},
                ${JSON.stringify(bbox)}, ${vec(arr)}, ${f.similarity},
                ${confirmed})
      `;
      faceCount++;
    }
    counts.face_appearances = faceCount;

    // 9) Life events.
    for (const le of rows.life_events as {
      kind: string;
      label: string;
      event_date: string | null;
      recurrence: string | null;
      description: string | null;
      embedding: unknown;
      subject_person_id: string | null;
    }[]) {
      const leArr = decodeEmbedding(le.embedding);
      const subject = le.subject_person_id
        ? peopleIdMap[le.subject_person_id] ?? null
        : null;
      await tx`
        INSERT INTO life_events
          (vault_id, subject_person_id, kind, label, event_date, recurrence,
           description, embedding)
        VALUES (${session.vault_id}, ${subject}, ${le.kind}, ${le.label},
                ${le.event_date}, ${le.recurrence}, ${le.description},
                ${leArr ? vec(leArr) : null})
      `;
    }
    counts.life_events = rows.life_events.length;

    // 10) Sealed letters.
    let letterCount = 0;
    for (const sl of rows.sealed_letters as {
      capture_id: string;
      to_nominee_id: string | null;
      occasion_prompt: string;
      intent_embedding: unknown;
      conditions: unknown;
      unlocked_at: string | null;
      unlocked_by_trigger: string | null;
      next_check_at: string | null;
    }[]) {
      const nid = capIdMap[sl.capture_id];
      if (!nid) continue;
      const toNom = sl.to_nominee_id ? nomIdMap[sl.to_nominee_id] ?? null : null;
      const intentArr = decodeEmbedding(sl.intent_embedding);
      const cond = decodeJson(sl.conditions);
      await tx`
        INSERT INTO sealed_letters
          (capture_id, vault_id, to_nominee_id, occasion_prompt,
           intent_embedding, conditions, unlocked_at, unlocked_by_trigger,
           next_check_at)
        VALUES (${nid}, ${session.vault_id}, ${toNom}, ${sl.occasion_prompt},
                ${intentArr ? vec(intentArr) : null},
                ${JSON.stringify(cond ?? {})}, ${sl.unlocked_at},
                ${sl.unlocked_by_trigger}, ${sl.next_check_at})
      `;
      letterCount++;
    }
    counts.sealed_letters = letterCount;

    // 11) Nominee releases. thread_id rows are skipped (threads
    //     intentionally aren't in the bundle yet).
    let releaseCount = 0;
    for (const r of rows.nominee_releases as {
      nominee_id: string;
      capture_id: string | null;
      thread_id: string | null;
      trigger: string;
      release_at: string | null;
      released_at: string | null;
      label: string | null;
    }[]) {
      if (r.thread_id) continue;
      const mappedNom = nomIdMap[r.nominee_id];
      if (!mappedNom) continue;
      const mappedCap = r.capture_id ? capIdMap[r.capture_id] ?? null : null;
      if (!mappedCap) continue;
      await tx`
        INSERT INTO nominee_releases
          (nominee_id, vault_id, capture_id, thread_id, trigger,
           release_at, released_at, label)
        VALUES (${mappedNom}, ${session.vault_id}, ${mappedCap}, NULL,
                ${r.trigger}, ${r.release_at}, ${r.released_at}, ${r.label})
        ON CONFLICT DO NOTHING
      `;
      releaseCount++;
    }
    counts.nominee_releases = releaseCount;

    // 12) Executor credentials.
    for (const ec of rows.executor_credentials as {
      nominee_id: string;
      passphrase_hash: string;
      used_at: string | null;
    }[]) {
      const mappedNom = nomIdMap[ec.nominee_id];
      if (!mappedNom) continue;
      await tx`
        INSERT INTO executor_credentials (vault_id, nominee_id,
                                          passphrase_hash, used_at)
        VALUES (${session.vault_id}, ${mappedNom},
                ${ec.passphrase_hash}, ${ec.used_at})
      `;
    }
    counts.executor_credentials = rows.executor_credentials.length;

    // 13) Voice profiles (one per vault).
    let voiceCount = 0;
    for (const vp of rows.voice_profiles as {
      voice_id: string;
      blob_url: string;
      reference_text: string;
      duration_ms: number | null;
      sample_rate: number | null;
    }[]) {
      const newBlob = blobNameMap[vp.blob_url];
      if (!newBlob) continue;
      await tx`
        INSERT INTO voice_profiles (vault_id, voice_id, blob_url,
                                    reference_text, duration_ms, sample_rate)
        VALUES (${session.vault_id}, ${vp.voice_id}, ${newBlob},
                ${vp.reference_text}, ${vp.duration_ms}, ${vp.sample_rate})
      `;
      voiceCount++;
    }
    counts.voice_profiles = voiceCount;

    // The target vault now has content - mark it onboarded so the
    // root route stops redirecting to /onboarding.
    await tx`
      UPDATE vaults SET onboarded_at = COALESCE(onboarded_at, now())
      WHERE id = ${session.vault_id}
    `;
  });

  return { vault_id: session.vault_id, counts };
}

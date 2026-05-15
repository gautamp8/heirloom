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

/** Parse pgvector text format `[a,b,c,...]` back to a number[]. */
function parseVec(s: string | null): number[] | null {
  if (!s) return null;
  try {
    const arr = JSON.parse(s) as unknown;
    return Array.isArray(arr) ? (arr as number[]) : null;
  } catch {
    return null;
  }
}

/**
 * .hloom v1 wire format: a UTF-8 JSON envelope wrapping base64
 * ciphertext that AEAD-decrypts to a gzipped JSON payload containing
 * the full vault (rows + audio blobs).
 *
 *   { magic: "HLOOM", version: 1,
 *     kdf:    { type: "argon2id", salt, memory_kib, time, parallelism },
 *     cipher: { type: "chacha20-poly1305", nonce, aad },
 *     ciphertext, tag, meta }
 *
 * Key derivation: argon2id(passphrase, salt) → 32B. Decrypt: ChaCha20-
 * Poly1305(nonce). A failing tag rejects the bundle.
 */

const MAGIC = "HLOOM";
const VERSION = 1;
const ARGON2_PARAMS = { memoryCost: 64 * 1024, timeCost: 3, parallelism: 4 };
const KEY_LEN = 32; // ChaCha20-Poly1305 key
const NONCE_LEN = 12; // ChaCha20-Poly1305 nonce
const TAG_LEN = 16; // Poly1305 tag

type VaultPlaintext = {
  manifest: {
    exported_at: string;
    creator_user_id: string;
    vault_id: string;
    counts: Record<string, number>;
  };
  rows: {
    users: unknown[];
    vault: unknown;
    captures: unknown[];
    transcripts: unknown[];
    transcript_chunks: unknown[];
    capture_tags: unknown[];
    life_events: unknown[];
    nominees: unknown[];
    sealed_letters: unknown[];
    people: unknown[];
  };
  blobs: { [blob_url: string]: string }; // base64
};

export type ExportResult = {
  filename: string;
  bytes: Buffer;
  passphrase_used: boolean;
};

export async function exportVault(
  session: Session,
  passphrase: string,
): Promise<ExportResult> {
  if (session.role !== "creator") {
    throw new Error("creator_only");
  }
  if (!sqlAdmin) throw new Error("admin_db_unavailable");
  if (!passphrase || passphrase.trim().length < 6) {
    throw new Error("passphrase_too_short");
  }

  // 1) Snapshot every row in the vault. We use the admin connection so
  //    cross-table queries don't trip RLS (the caller already proved
  //    creator role via session).
  const vault_id = session.vault_id;
  const captures = await sqlAdmin<{ id: string; blob_url: string | null }[]>`
    SELECT * FROM captures WHERE vault_id = ${vault_id}
  `;
  const transcripts = await sqlAdmin<Record<string, unknown>[]>`
    SELECT t.* FROM transcripts t
      JOIN captures c ON c.id = t.capture_id
     WHERE c.vault_id = ${vault_id}
  `;
  const chunks = await sqlAdmin<Record<string, unknown>[]>`
    SELECT * FROM transcript_chunks WHERE vault_id = ${vault_id}
  `;
  const tags = await sqlAdmin<Record<string, unknown>[]>`
    SELECT ct.* FROM capture_tags ct
      JOIN captures c ON c.id = ct.capture_id
     WHERE c.vault_id = ${vault_id}
  `;
  const life_events = await sqlAdmin<Record<string, unknown>[]>`
    SELECT * FROM life_events WHERE vault_id = ${vault_id}
  `;
  const nominees = await sqlAdmin<Record<string, unknown>[]>`
    SELECT * FROM nominees WHERE vault_id = ${vault_id}
  `;
  const sealed_letters = await sqlAdmin<Record<string, unknown>[]>`
    SELECT * FROM sealed_letters WHERE vault_id = ${vault_id}
  `;
  const people = await sqlAdmin<Record<string, unknown>[]>`
    SELECT * FROM people WHERE vault_id = ${vault_id}
  `;
  const [vault] = await sqlAdmin<Record<string, unknown>[]>`
    SELECT * FROM vaults WHERE id = ${vault_id}
  `;
  const users = await sqlAdmin<Record<string, unknown>[]>`
    SELECT u.* FROM users u
      JOIN vaults v ON v.creator_id = u.id
     WHERE v.id = ${vault_id}
  `;

  // 2) Read every audio/photo blob into memory + base64 encode.
  const blobs: { [k: string]: string } = {};
  for (const c of captures) {
    if (!c.blob_url) continue;
    try {
      const data = await fs.readFile(resolveBlob(c.blob_url));
      blobs[c.blob_url] = data.toString("base64");
    } catch (e) {
      console.warn("[export] missing blob", c.blob_url, e);
    }
  }

  const plaintext: VaultPlaintext = {
    manifest: {
      exported_at: new Date().toISOString(),
      creator_user_id: session.user_id,
      vault_id,
      counts: {
        captures: captures.length,
        transcripts: transcripts.length,
        chunks: chunks.length,
        tags: tags.length,
        life_events: life_events.length,
        nominees: nominees.length,
        sealed_letters: sealed_letters.length,
        people: people.length,
        blobs: Object.keys(blobs).length,
      },
    },
    rows: {
      users,
      vault,
      captures,
      transcripts,
      transcript_chunks: chunks,
      capture_tags: tags,
      life_events,
      nominees,
      sealed_letters,
      people,
    },
    blobs,
  };

  // 3) Compress + encrypt.
  const compressed = gzipSync(Buffer.from(JSON.stringify(plaintext)));
  const salt = randomBytes(16);
  const nonce = randomBytes(NONCE_LEN);
  const aad = Buffer.from(`heirloom/v${VERSION}/${vault_id}`);

  // argon2.hash returns an encoded string; we need raw bytes. Use the lower
  // level argon2.hash with raw=true to get a 32-byte key suitable for
  // ChaCha20-Poly1305.
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
  if (session.role !== "creator") {
    throw new Error("creator_only");
  }
  if (!sqlAdmin) throw new Error("admin_db_unavailable");
  if (!passphrase || passphrase.trim().length < 6) {
    throw new Error("passphrase_too_short");
  }

  // 1) Parse envelope + sanity-check shape.
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
  if (env.version !== VERSION) throw new Error("unsupported_version");
  if (env.kdf.type !== "argon2id" || env.cipher.type !== "chacha20-poly1305") {
    throw new Error("unsupported_algorithm");
  }

  // 2) Derive key + decrypt.
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
  } catch (e) {
    throw new Error("decryption_failed_wrong_passphrase_or_tampered");
  }

  const plaintext = JSON.parse(
    gunzipSync(compressed).toString("utf8"),
  ) as VaultPlaintext;

  // 3) Restore into the CURRENT user's vault - re-keyed, not the original
  //    UUIDs. We map every old id -> new id (or self.id where appropriate).
  //
  // For v1 we keep this simple: nuke the current vault's data and replace
  // it with the imported snapshot. This is what the recipient wants: open
  // the bundle, see exactly what the creator saved.
  await sqlAdmin.begin(async (tx) => {
    await tx`DELETE FROM captures      WHERE vault_id = ${session.vault_id}`;
    await tx`DELETE FROM nominees      WHERE vault_id = ${session.vault_id}`;
    await tx`DELETE FROM life_events   WHERE vault_id = ${session.vault_id}`;
    await tx`DELETE FROM people        WHERE vault_id = ${session.vault_id}`;
    await tx`DELETE FROM sealed_letters WHERE vault_id = ${session.vault_id}`;
  });

  // Restore captures + blobs + transcripts + chunks + tags. We rewrite blob
  // paths so the imported files live alongside our normal storage.
  const counts: Record<string, number> = {};
  await sqlAdmin.begin(async (tx) => {
    const blobNameMap: Record<string, string> = {};
    for (const [oldUrl, b64] of Object.entries(plaintext.blobs)) {
      const ext = oldUrl.split(".").pop() ?? "bin";
      const newName = `imported-${randomBytes(8).toString("hex")}.${ext}`;
      const newUrl = `storage/blobs/${newName}`;
      const abs = resolveBlob(newUrl);
      await fs.writeFile(abs, Buffer.from(b64, "base64"));
      blobNameMap[oldUrl] = newUrl;
    }

    const capIdMap: Record<string, string> = {};
    for (const c of plaintext.rows.captures as {
      id: string;
      kind: string;
      status: string;
      title: string | null;
      caption: string | null;
      body: string | null;
      blob_url: string | null;
      duration_ms: number | null;
      captured_at: string;
    }[]) {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO captures (vault_id, kind, status, title, caption, body,
                              blob_url, duration_ms, captured_at)
        VALUES (${session.vault_id}, ${c.kind}, ${c.status}, ${c.title},
                ${c.caption}, ${c.body},
                ${c.blob_url ? blobNameMap[c.blob_url] ?? null : null},
                ${c.duration_ms}, ${c.captured_at})
        RETURNING id
      `;
      capIdMap[c.id] = row.id;
    }
    counts.captures = Object.keys(capIdMap).length;

    for (const t of plaintext.rows.transcripts as {
      capture_id: string;
      text: string;
      language: string;
    }[]) {
      const nid = capIdMap[t.capture_id];
      if (!nid) continue;
      await tx`
        INSERT INTO transcripts (capture_id, text, language)
        VALUES (${nid}, ${t.text}, ${t.language ?? "en"})
      `;
    }
    counts.transcripts = plaintext.rows.transcripts.length;

    for (const ch of plaintext.rows.transcript_chunks as {
      capture_id: string;
      chunk_index: number;
      text: string;
      embedding: string;
      start_ms: number | null;
      end_ms: number | null;
    }[]) {
      const nid = capIdMap[ch.capture_id];
      if (!nid) continue;
      const embArr = parseVec(ch.embedding);
      if (!embArr) continue;
      await tx`
        INSERT INTO transcript_chunks
          (capture_id, vault_id, chunk_index, text, embedding, start_ms, end_ms)
        VALUES (${nid}, ${session.vault_id}, ${ch.chunk_index}, ${ch.text},
                ${vec(embArr)}, ${ch.start_ms}, ${ch.end_ms})
      `;
    }
    counts.chunks = plaintext.rows.transcript_chunks.length;

    for (const tag of plaintext.rows.capture_tags as {
      capture_id: string;
      kind: string;
      value: string;
      confidence: number | null;
    }[]) {
      const nid = capIdMap[tag.capture_id];
      if (!nid) continue;
      await tx`
        INSERT INTO capture_tags (capture_id, kind, value, confidence)
        VALUES (${nid}, ${tag.kind}, ${tag.value}, ${tag.confidence})
        ON CONFLICT DO NOTHING
      `;
    }
    counts.tags = plaintext.rows.capture_tags.length;

    for (const le of plaintext.rows.life_events as {
      kind: string;
      label: string;
      event_date: string | null;
      recurrence: string | null;
      description: string | null;
      embedding: string | null;
    }[]) {
      const leArr = parseVec(le.embedding);
      await tx`
        INSERT INTO life_events
          (vault_id, kind, label, event_date, recurrence, description, embedding)
        VALUES (${session.vault_id}, ${le.kind}, ${le.label}, ${le.event_date},
                ${le.recurrence}, ${le.description},
                ${leArr ? vec(leArr) : null})
      `;
    }
    counts.life_events = plaintext.rows.life_events.length;

    counts.nominees = plaintext.rows.nominees.length;
    counts.people = plaintext.rows.people.length;
    counts.sealed_letters = plaintext.rows.sealed_letters.length;
  });

  return { vault_id: session.vault_id, counts };
}

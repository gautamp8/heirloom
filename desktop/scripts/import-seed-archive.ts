/**
 * Import a seed-archive folder (e.g. desktop/seed-archives/sagan) into the
 * running Heirloom instance as a fresh creator + nominee + vault.
 *
 * Usage:
 *   pnpm tsx desktop/scripts/import-seed-archive.ts ./desktop/seed-archives/sagan
 *
 * Requires:
 *   - HEIRLOOM_BACKEND=postgres (or sqlite) + DATABASE_URL set
 *   - Heirloom server NOT required — script talks to DB + TTS sidecar directly
 *   - TTS sidecar running on HEIRLOOM_TTS_URL (default 127.0.0.1:11435)
 *   - Ollama running for embeddings (gemma4 + embeddinggemma pulled)
 *
 * What it creates:
 *   - users(email='sagan@heirloom.local', display_name='Carl Sagan')
 *   - vaults(name='Carl Sagan archive')
 *   - one nominee 'You' with passphrase 'pale blue dot · 1990'
 *   - captures for each note/photo in the manifest
 *   - voice_profiles row with the reference WAV
 *   - sealed_letters wired through the existing condition engine
 */

import * as fs from "node:fs";
import * as path from "node:path";
import argon2 from "argon2";
import postgres from "postgres";

type Manifest = {
  name: string;
  tagline: string;
  dates: string;
  voice_reference: string;
  voice_reference_text: string;
  voice_reference_is_placeholder?: boolean;
  framing_letter: { from_name: string; to_name: string; body: string };
  captures: {
    title: string;
    kind: "note" | "photo" | "audio";
    captured_at: string;
    body?: string;
    blob?: string;
    caption?: string;
    source_url: string;
    license: string;
  }[];
  sealed_letters: {
    occasion_prompt: string;
    trigger_hint: string;
    body: string;
  }[];
};

const TTS_BASE = process.env.HEIRLOOM_TTS_URL ?? "http://127.0.0.1:11435";
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const STORAGE_ROOT = path.resolve(
  process.env.HEIRLOOM_BLOB_DIR ??
    path.join(process.cwd(), "storage", "blobs"),
);

async function main() {
  const seedDir = process.argv[2];
  if (!seedDir) {
    console.error("usage: import-seed-archive.ts <path-to-archive-dir>");
    process.exit(1);
  }
  const absSeed = path.resolve(seedDir);
  const manifestPath = path.join(absSeed, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`no manifest.json at ${manifestPath}`);
    process.exit(1);
  }
  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  // Use the admin connection so we bypass per-vault RLS while seeding.
  const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_ADMIN_URL (or DATABASE_URL) not set");
    process.exit(1);
  }
  const sql = postgres(url, { max: 4, transform: { undefined: null } });
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });

  console.log(`importing "${manifest.name}" from ${absSeed}`);

  const email = `${slug(manifest.name)}@heirloom.local`;
  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (email, display_name)
    VALUES (${email}, ${manifest.name})
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id
  `;
  const [vault] = await sql<{ id: string }[]>`
    INSERT INTO vaults (creator_id, name)
    SELECT ${user.id}, ${manifest.name + " archive"}
    WHERE NOT EXISTS (SELECT 1 FROM vaults WHERE creator_id = ${user.id})
    RETURNING id
  `;
  const vaultId =
    vault?.id ??
    (
      await sql<{ id: string }[]>`
        SELECT id FROM vaults WHERE creator_id = ${user.id} LIMIT 1
      `
    )[0].id;
  console.log(`  vault: ${vaultId}`);

  await sql`UPDATE vaults SET onboarded_at = COALESCE(onboarded_at, now()) WHERE id = ${vaultId}`;

  // Voice profile: register the reference wav with the TTS sidecar and
  // upsert the row that downstream /api/voice/speak reads from.
  const refPath = path.join(absSeed, manifest.voice_reference);
  if (fs.existsSync(refPath)) {
    const wav = fs.readFileSync(refPath);
    const blobUrl = await writeBlob(wav, "wav");
    const fd = new FormData();
    fd.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "reference.wav");
    const r = await fetch(`${TTS_BASE}/encode`, { method: "POST", body: fd });
    if (!r.ok) {
      console.warn(`  voice encode failed (${r.status}); skipping voice profile`);
    } else {
      const { voice_id, duration_seconds, sample_rate } = (await r.json()) as {
        voice_id: string;
        duration_seconds: number;
        sample_rate: number;
      };
      await sql`
        INSERT INTO voice_profiles
          (vault_id, voice_id, blob_url, reference_text, duration_ms, sample_rate)
        VALUES (${vaultId}, ${voice_id}, ${blobUrl}, ${manifest.voice_reference_text},
                ${Math.round(duration_seconds * 1000)}, ${sample_rate})
        ON CONFLICT (vault_id) DO UPDATE
          SET voice_id = EXCLUDED.voice_id,
              blob_url = EXCLUDED.blob_url,
              reference_text = EXCLUDED.reference_text,
              duration_ms = EXCLUDED.duration_ms,
              sample_rate = EXCLUDED.sample_rate
      `;
      console.log(`  voice_id: ${voice_id} (${duration_seconds.toFixed(1)}s)`);
      if (manifest.voice_reference_is_placeholder) {
        console.log(`  (voice is a placeholder; replace ${refPath} with a real clip for authenticity)`);
      }
    }
  }

  // Captures
  for (const cap of manifest.captures) {
    let blobUrl: string | null = null;
    let body: string | null = null;
    let caption: string | null = null;
    if (cap.kind === "note") {
      body = cap.body ?? null;
    } else if (cap.kind === "photo" && cap.blob) {
      const abs = path.join(absSeed, cap.blob);
      if (!fs.existsSync(abs)) {
        console.warn(`  missing blob: ${cap.blob}`);
        continue;
      }
      const ext = path.extname(cap.blob).slice(1) || "jpg";
      const data = fs.readFileSync(abs);
      blobUrl = await writeBlob(data, ext);
      caption = cap.caption ?? null;
    }

    const [row] = await sql<{ id: string }[]>`
      INSERT INTO captures (vault_id, kind, status, title, body, caption, blob_url, captured_at)
      VALUES (${vaultId}, ${cap.kind}, 'ready', ${cap.title}, ${body},
              ${caption}, ${blobUrl}, ${cap.captured_at})
      RETURNING id
    `;

    // Embed the searchable text for note/photo and store one chunk so
    // Reflection retrieval can find it.
    const embedText = body ?? caption ?? cap.title;
    if (embedText) {
      const vec = await embed(embedText);
      const lit = `[${vec.join(",")}]`;
      await sql`
        INSERT INTO transcript_chunks (capture_id, vault_id, chunk_index, text, embedding)
        VALUES (${row.id}, ${vaultId}, 0, ${embedText}, ${lit}::vector)
      `;
    }
    console.log(`  capture: ${cap.kind} - ${cap.title}`);
  }

  // One nominee, "You", with a clean passphrase printed below.
  const passphrase = `${slug(manifest.name)} archive · 1990`;
  const passphrase_hash = await argon2.hash(passphrase.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), { type: argon2.argon2id });
  await sql`
    INSERT INTO nominees (vault_id, name, relationship, letter_body, passphrase_hash, passphrase_set_at)
    VALUES (${vaultId}, ${"You"}, ${"reader"}, ${manifest.framing_letter.body},
            ${passphrase_hash}, now())
    ON CONFLICT DO NOTHING
  `;
  const [nominee] = await sql<{ id: string }[]>`
    SELECT id FROM nominees WHERE vault_id = ${vaultId} LIMIT 1
  `;

  // Auto-release every capture to the nominee
  await sql`
    INSERT INTO nominee_releases (vault_id, capture_id, nominee_id, trigger, released_at, label)
    SELECT ${vaultId}, c.id, ${nominee.id}, 'scheduled', now(), 'seed import'
      FROM captures c
     WHERE c.vault_id = ${vaultId}
    ON CONFLICT DO NOTHING
  `;

  // Sealed letters
  for (const letter of manifest.sealed_letters) {
    const intent_text = `${letter.occasion_prompt}. ${letter.trigger_hint}`;
    const intent_vec = await embed(intent_text);
    const intent_lit = `[${intent_vec.join(",")}]`;

    const [cap] = await sql<{ id: string }[]>`
      INSERT INTO captures (vault_id, kind, status, title, body)
      VALUES (${vaultId}, 'note', 'ready', ${letter.occasion_prompt}, ${letter.body})
      RETURNING id
    `;
    const conditions = {
      any_of: [
        { kind: "semantic_match", threshold: 0.55, topic: letter.trigger_hint },
        { kind: "first_visit" },
      ],
    };
    await sql`
      INSERT INTO sealed_letters
        (capture_id, vault_id, to_nominee_id, occasion_prompt, intent_embedding, conditions)
      VALUES (${cap.id}, ${vaultId}, ${nominee.id}, ${letter.occasion_prompt},
              ${intent_lit}::vector, ${sql.json(conditions)})
    `;
    console.log(`  sealed letter: ${letter.occasion_prompt}`);
  }

  console.log(`\nDone.`);
  console.log(`  nominee passphrase: ${passphrase}`);
  console.log(`  open /portal, click "I have a sealed letter", enter that phrase.`);

  await sql.end();
}

async function embed(text: string): Promise<number[]> {
  const r = await fetch(`${OLLAMA_BASE}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "embeddinggemma", input: text }),
  });
  if (!r.ok) throw new Error(`embed: ${r.status}`);
  const { embeddings } = (await r.json()) as { embeddings: number[][] };
  return embeddings[0];
}

async function writeBlob(data: Buffer, ext: string): Promise<string> {
  const id = crypto.randomUUID();
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(STORAGE_ROOT, filename), data);
  return `storage/blobs/${filename}`;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { mkdtempSync } from "node:fs";
import { promises as fs } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { seedVault, setupSqlite, unitVec } from "../helpers/db";

// src/lib/db/index.ts picks its backend with an extensionless CJS
// require("./sqlite"). Under vitest that require is native Node, which
// never tries the .ts extension — though Node 22 can load an explicit
// .ts path. Retry failed resolutions with the extension appended.
type Resolver = (request: string, ...rest: unknown[]) => string;
const moduleInternals = Module as unknown as { _resolveFilename: Resolver };
const nativeResolve = moduleInternals._resolveFilename;
moduleInternals._resolveFilename = function (
  this: unknown,
  request: string,
  ...rest: unknown[]
) {
  try {
    return nativeResolve.call(this, request, ...rest);
  } catch (err) {
    if (typeof request === "string" && !request.endsWith(".ts")) {
      try {
        return nativeResolve.call(this, `${request}.ts`, ...rest);
      } catch {
        throw err;
      }
    }
    throw err;
  }
};

// Storage root is frozen at import time in src/lib/storage.ts, so the
// blob dir must exist in env before the dynamic imports below.
process.env.HEIRLOOM_BLOB_DIR = mkdtempSync(
  path.join(tmpdir(), "heirloom-blobs-"),
);

type Envelope = {
  magic: string;
  version: number;
  kdf: Record<string, unknown>;
  cipher: Record<string, unknown>;
  ciphertext: string;
  tag: string;
  meta: { counts: Record<string, number> };
};

function f32(arr: number[]): Buffer {
  const buf = Buffer.alloc(arr.length * 4);
  arr.forEach((x, i) => buf.writeFloatLE(x, i * 4));
  return buf;
}

function withEnvelope(
  bytes: Buffer,
  mutate: (env: Envelope) => void,
): Buffer {
  const env = JSON.parse(bytes.toString("utf8")) as Envelope;
  mutate(env);
  return Buffer.from(JSON.stringify(env));
}

function flipMiddleByte(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  buf[Math.floor(buf.length / 2)] ^= 0xff;
  return buf.toString("base64");
}

const PASSPHRASE = "orchard-gate-1987";
const NOTE_BODY = "The oak tree keeled over in the storm of 1987.";
const CHUNK_VEC = unitVec(5);
const INTENT_VEC = unitVec(7);
const CONDITIONS = { type: "date", release_at: "2030-01-01" };
const PHOTO_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7,
]);

let sql: Awaited<ReturnType<typeof setupSqlite>>["sql"];
let exportVault: typeof import("@/lib/vault-export").exportVault;
let importVault: typeof import("@/lib/vault-export").importVault;
let resolveBlob: typeof import("@/lib/storage").resolveBlob;

let sessionA: { user_id: string; vault_id: string; role: "creator" };
let sessionB: { user_id: string; vault_id: string; role: "creator" };
let exported: { filename: string; bytes: Buffer };
let envelope: Envelope;
let importSummary: { vault_id: string; counts: Record<string, number> };

beforeAll(async () => {
  const db = await setupSqlite();
  sql = db.sql;
  const vaultExport = await import("@/lib/vault-export");
  exportVault = vaultExport.exportVault;
  importVault = vaultExport.importVault;
  const storage = await import("@/lib/storage");
  resolveBlob = storage.resolveBlob;

  const a = await seedVault(sql);
  sessionA = { ...a, role: "creator" };

  const [note] = await sql<{ id: string }[]>`
    INSERT INTO captures (vault_id, kind, status, title, body, captured_at)
    VALUES (${a.vault_id}, 'note', 'ready', 'The oak tree', ${NOTE_BODY},
            '2020-05-04T10:00:00.000Z')
    RETURNING id`;
  await sql`
    INSERT INTO transcript_chunks
      (capture_id, vault_id, chunk_index, text, embedding)
    VALUES (${note.id}, ${a.vault_id}, 0, ${NOTE_BODY}, ${db.vec(CHUNK_VEC)})`;
  await sql`
    INSERT INTO capture_tags (capture_id, kind, value, confidence)
    VALUES (${note.id}, 'topic', 'farm', 0.9)`;

  const [nom] = await sql<{ id: string }[]>`
    INSERT INTO nominees (vault_id, user_id, name, relationship, email, role,
                          letter_body, passphrase_hash, passphrase_set_at)
    VALUES (${a.vault_id}, ${a.user_id}, 'June', 'daughter',
            'june@test.local', 'recipient', 'For you, June.',
            'fake-argon2-hash', '2020-05-04T10:00:00.000Z')
    RETURNING id`;

  await sql`
    INSERT INTO sealed_letters
      (capture_id, vault_id, to_nominee_id, occasion_prompt,
       intent_embedding, conditions)
    VALUES (${note.id}, ${a.vault_id}, ${nom.id}, 'When June turns thirty',
            ${db.vec(INTENT_VEC)}, ${JSON.stringify(CONDITIONS)})`;

  const blobName = "roundtrip-photo.png";
  await fs.writeFile(
    path.join(process.env.HEIRLOOM_BLOB_DIR!, blobName),
    PHOTO_BYTES,
  );
  await sql`
    INSERT INTO captures (vault_id, kind, status, caption, blob_url, captured_at)
    VALUES (${a.vault_id}, 'photo', 'ready', 'At the farm',
            ${`storage/blobs/${blobName}`}, '2021-06-01T09:00:00.000Z')`;

  exported = await exportVault(sessionA, PASSPHRASE);
  envelope = JSON.parse(exported.bytes.toString("utf8")) as Envelope;

  const b = await seedVault(sql);
  sessionB = { ...b, role: "creator" };
  importSummary = await importVault(exported.bytes, PASSPHRASE, sessionB);
}, 120_000);

describe("export envelope", () => {
  it("carries the versioned HLOOM header and hardened crypto params", () => {
    expect(envelope.magic).toBe("HLOOM");
    expect(envelope.version).toBe(2);
    expect(envelope.kdf).toMatchObject({
      type: "argon2id",
      memory_kib: 64 * 1024,
      time: 3,
      parallelism: 4,
    });
    expect(envelope.cipher).toMatchObject({ type: "chacha20-poly1305" });
  });

  it("counts every seeded row in the manifest", () => {
    expect(envelope.meta.counts).toMatchObject({
      captures: 2,
      chunks: 1,
      tags: 1,
      nominees: 1,
      sealed_letters: 1,
      blobs: 1,
    });
  });

  it("names the file after the vault and export date", () => {
    expect(exported.filename).toMatch(
      /^heirloom-[0-9a-f]{8}-\d{4}-\d{2}-\d{2}\.hloom$/,
    );
  });

  it("does not leak plaintext into the envelope", () => {
    expect(exported.bytes.toString("utf8")).not.toContain(NOTE_BODY);
  });
});

describe("import round-trip into a fresh vault", () => {
  it("reports the same counts the export promised", () => {
    expect(importSummary.vault_id).toBe(sessionB.vault_id);
    expect(importSummary.counts).toMatchObject({
      captures: 2,
      chunks: 1,
      tags: 1,
      nominees: 1,
      sealed_letters: 1,
      blobs: 1,
    });
  });

  it("carries the note body verbatim", async () => {
    const [row] = await sql<{ body: string }[]>`
      SELECT body FROM captures
       WHERE vault_id = ${sessionB.vault_id} AND kind = 'note'`;
    expect(row.body).toBe(NOTE_BODY);
  });

  it("round-trips the chunk embedding byte-identically", async () => {
    const [row] = await sql<{ embedding: Buffer; text: string }[]>`
      SELECT embedding, text FROM transcript_chunks
       WHERE vault_id = ${sessionB.vault_id}`;
    expect(row.text).toBe(NOTE_BODY);
    expect(Buffer.from(row.embedding).equals(f32(CHUNK_VEC))).toBe(true);
  });

  it("carries the tag onto the remapped capture", async () => {
    const [row] = await sql<{ kind: string; value: string }[]>`
      SELECT ct.kind, ct.value FROM capture_tags ct
        JOIN captures c ON c.id = ct.capture_id
       WHERE c.vault_id = ${sessionB.vault_id}`;
    expect(row).toMatchObject({ kind: "topic", value: "farm" });
  });

  it("rehydrates the photo blob byte-identically under a fresh name", async () => {
    const [row] = await sql<{ blob_url: string }[]>`
      SELECT blob_url FROM captures
       WHERE vault_id = ${sessionB.vault_id} AND kind = 'photo'`;
    expect(row.blob_url).toMatch(/^storage\/blobs\/imported-[0-9a-f]{16}\.png$/);
    const data = await fs.readFile(resolveBlob(row.blob_url));
    expect(data.equals(PHOTO_BYTES)).toBe(true);
  });

  it("carries the nominee but severs the stale user link", async () => {
    const [row] = await sql<{
      name: string;
      passphrase_hash: string;
      user_id: string | null;
    }[]>`
      SELECT name, passphrase_hash, user_id FROM nominees
       WHERE vault_id = ${sessionB.vault_id}`;
    expect(row.name).toBe("June");
    expect(row.passphrase_hash).toBe("fake-argon2-hash");
    expect(row.user_id).toBeNull();
  });

  it("remaps the sealed letter's capture and nominee, keeping conditions and intent", async () => {
    const [letter] = await sql<{
      occasion_prompt: string;
      conditions: unknown;
      intent_embedding: Buffer;
      to_nominee_id: string;
      capture_id: string;
    }[]>`
      SELECT * FROM sealed_letters WHERE vault_id = ${sessionB.vault_id}`;
    expect(letter.occasion_prompt).toBe("When June turns thirty");
    const cond =
      typeof letter.conditions === "string"
        ? JSON.parse(letter.conditions)
        : letter.conditions;
    expect(cond).toEqual(CONDITIONS);
    expect(
      Buffer.from(letter.intent_embedding).equals(f32(INTENT_VEC)),
    ).toBe(true);
    const [nomB] = await sql<{ id: string }[]>`
      SELECT id FROM nominees WHERE vault_id = ${sessionB.vault_id}`;
    const [noteB] = await sql<{ id: string }[]>`
      SELECT id FROM captures
       WHERE vault_id = ${sessionB.vault_id} AND kind = 'note'`;
    expect(letter.to_nominee_id).toBe(nomB.id);
    expect(letter.capture_id).toBe(noteB.id);
  });
});

describe("tamper and misuse failures", () => {
  it(
    "rejects a flipped byte mid-ciphertext and leaves the vault intact",
    async () => {
      const tampered = withEnvelope(exported.bytes, (env) => {
        env.ciphertext = flipMiddleByte(env.ciphertext);
      });
      await expect(
        importVault(tampered, PASSPHRASE, sessionB),
      ).rejects.toThrow("decryption_failed");
      const [row] = await sql<{ n: number }[]>`
        SELECT COUNT(*) AS n FROM captures
         WHERE vault_id = ${sessionB.vault_id}`;
      expect(row.n).toBe(2);
    },
    60_000,
  );

  it(
    "rejects a flipped byte in the auth tag",
    async () => {
      const tampered = withEnvelope(exported.bytes, (env) => {
        env.tag = flipMiddleByte(env.tag);
      });
      await expect(
        importVault(tampered, PASSPHRASE, sessionB),
      ).rejects.toThrow("decryption_failed");
    },
    60_000,
  );

  it(
    "rejects the wrong passphrase",
    async () => {
      await expect(
        importVault(exported.bytes, "not-the-passphrase", sessionB),
      ).rejects.toThrow("decryption_failed");
    },
    60_000,
  );

  it("rejects a corrupted magic before touching the KDF", async () => {
    const tampered = withEnvelope(exported.bytes, (env) => {
      env.magic = "MLOOH";
    });
    await expect(
      importVault(tampered, PASSPHRASE, sessionB),
    ).rejects.toThrow("not_a_heirloom_bundle");
  });

  it("refuses to export with a short passphrase", async () => {
    await expect(exportVault(sessionA, "12345")).rejects.toThrow(
      "passphrase_too_short",
    );
  });

  it("refuses to export for a nominee session", async () => {
    await expect(
      exportVault({ ...sessionA, role: "nominee" }, PASSPHRASE),
    ).rejects.toThrow("creator_only");
  });
});

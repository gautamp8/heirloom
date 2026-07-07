import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { seedVault, setupSqlite, unitVec } from "../helpers/db";

const LEGACY = "ollama/embeddinggemma@768";

let db: Awaited<ReturnType<typeof setupSqlite>>;
let guard: typeof import("@/lib/embedding-guard");
let provider: typeof import("@/lib/provider");

/** Point the local profile at `model` and drop both identity caches, the
 *  same sequence a real embedder switch goes through. */
function useEmbedder(model: string) {
  process.env.OLLAMA_EMBEDDING_MODEL = model;
  provider.invalidateProviderCache();
  guard.invalidateEmbeddingGuardCache();
}

async function readMeta(
  vaultId: string,
): Promise<{ identity: string; stamped_at: string } | null> {
  const [row] = await db.sql<{ embedding_meta: unknown }[]>`
    SELECT embedding_meta FROM vaults WHERE id = ${vaultId}`;
  const raw = row?.embedding_meta;
  if (!raw) return null;
  return typeof raw === "string"
    ? JSON.parse(raw)
    : (raw as { identity: string; stamped_at: string });
}

async function rejection(
  p: Promise<unknown>,
): Promise<{ status?: number; message: string }> {
  try {
    await p;
  } catch (e) {
    return e as { status?: number; message: string };
  }
  throw new Error("expected rejection, but the promise resolved");
}

beforeAll(async () => {
  delete process.env.HEIRLOOM_PROVIDER_PROFILE;
  process.env.OLLAMA_EMBEDDING_MODEL = "embeddinggemma";
  db = await setupSqlite();
  guard = await import("@/lib/embedding-guard");
  provider = await import("@/lib/provider");
});

describe("ensureVaultEmbedder", () => {
  it("stamps a fresh vault (no vectors, no meta) with the current identity", async () => {
    useEmbedder("embeddinggemma");
    const { vault_id } = await seedVault(db.sql);

    await expect(guard.ensureVaultEmbedder(vault_id)).resolves.toBeUndefined();

    const meta = await readMeta(vault_id);
    expect(meta?.identity).toBe(LEGACY);
    expect(Number.isNaN(Date.parse(meta?.stamped_at ?? ""))).toBe(false);
  });

  it("fresh vault adopts a non-default active embedder", async () => {
    useEmbedder("granite-embedding");
    const { vault_id } = await seedVault(db.sql);

    await guard.ensureVaultEmbedder(vault_id);

    expect((await readMeta(vault_id))?.identity).toBe(
      "ollama/granite-embedding@768",
    );
  });

  it("unstamped vault with vectors gets the legacy stamp, then 409s under a new embedder", async () => {
    useEmbedder("newmodel");
    const { vault_id } = await seedVault(db.sql);
    const capture_id = randomUUID();
    await db.sql`
      INSERT INTO captures (id, vault_id, kind, status)
      VALUES (${capture_id}, ${vault_id}, ${"note"}, ${"ready"})`;
    await db.sql`
      INSERT INTO transcript_chunks (capture_id, vault_id, chunk_index, text, embedding)
      VALUES (${capture_id}, ${vault_id}, 0, ${"pre-provider chunk"}, ${db.vec(unitVec(3))})`;

    const err = await rejection(guard.ensureVaultEmbedder(vault_id));
    expect(err.status).toBe(409);
    expect(err.message).toContain("embedding_mismatch");
    expect(err.message).toContain("ollama/newmodel@768");
    // The legacy stamp persists even though the call threw.
    expect((await readMeta(vault_id))?.identity).toBe(LEGACY);
  });

  it("stamped vault + matching identity resolves, and repeat calls hit the cache", async () => {
    useEmbedder("embeddinggemma");
    const { vault_id } = await seedVault(db.sql);
    await guard.ensureVaultEmbedder(vault_id);

    // Corrupt the stored stamp WITHOUT invalidating the guard cache: a
    // cached vault skips the DB read entirely, so this still resolves.
    await db.sql`
      UPDATE vaults SET embedding_meta = ${JSON.stringify({
        identity: "ollama/bogus@768",
        stamped_at: new Date().toISOString(),
      })}
      WHERE id = ${vault_id}`;
    await expect(guard.ensureVaultEmbedder(vault_id)).resolves.toBeUndefined();

    // Dropping the cache exposes the mismatch on the next call.
    guard.invalidateEmbeddingGuardCache();
    const err = await rejection(guard.ensureVaultEmbedder(vault_id));
    expect(err.status).toBe(409);
    expect(err.message).toContain("ollama/bogus@768");
  });

  it("mismatched identity throws; switching the embedder back passes again", async () => {
    useEmbedder("embeddinggemma");
    const { vault_id } = await seedVault(db.sql);
    await guard.ensureVaultEmbedder(vault_id);

    useEmbedder("othermodel");
    const err = await rejection(guard.ensureVaultEmbedder(vault_id));
    expect(err.status).toBe(409);
    expect(err.message).toContain(LEGACY);

    useEmbedder("embeddinggemma");
    await expect(guard.ensureVaultEmbedder(vault_id)).resolves.toBeUndefined();
  });

  it("unknown vault id throws 404 vault_not_found", async () => {
    useEmbedder("embeddinggemma");
    const err = await rejection(guard.ensureVaultEmbedder(randomUUID()));
    expect(err.status).toBe(404);
    expect(err.message).toBe("vault_not_found");
  });
});

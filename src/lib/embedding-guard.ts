import { sqlAdmin } from "./db";
import { embeddingIdentity } from "./provider";
import { HttpError } from "./auth";

/**
 * Embeddings are vault-scoped state: vectors written by one embedding
 * model must never be compared against a query vector from another. Every
 * vault records which embedder built its index (`vaults.embedding_meta`),
 * and every path that embeds — ingest, retrieval, letter probes — calls
 * `ensureVaultEmbedder` first. On mismatch the request fails loudly with
 * a 409 rather than silently returning garbage similarities;
 * `scripts/reindex-embeddings.ts` rebuilds the index under the new model.
 */

/** The only embedder that existed before vaults carried metadata, so a
 *  vault with vectors but no stamp is by definition this one. */
const LEGACY_IDENTITY = "ollama/embeddinggemma@768";

export const EMBEDDING_MISMATCH = "embedding_mismatch";

type Meta = { identity: string; stamped_at: string };

function decodeMeta(raw: unknown): Meta | null {
  if (!raw) return null;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (v && typeof v === "object" && typeof (v as Meta).identity === "string")
      return v as Meta;
  } catch {
    /* fall through */
  }
  return null;
}

// A vault's stamp only changes via this module or a reindex, so a short
// cache keeps the guard from adding a query to every reflect/capture.
const verified = new Map<string, { identity: string; at: number }>();
const CACHE_TTL_MS = 15_000;

/** Test hook — drops the per-vault verification cache. */
export function invalidateEmbeddingGuardCache() {
  verified.clear();
}

async function vaultHasVectors(vaultId: string): Promise<boolean> {
  if (!sqlAdmin) return false;
  const [row] = await sqlAdmin<{ n: number }[]>`
    SELECT (SELECT COUNT(*) FROM transcript_chunks WHERE vault_id = ${vaultId})
         + (SELECT COUNT(*) FROM life_events WHERE vault_id = ${vaultId} AND embedding IS NOT NULL)
         + (SELECT COUNT(*) FROM sealed_letters WHERE vault_id = ${vaultId} AND intent_embedding IS NOT NULL)
      AS n`;
  return Number(row?.n ?? 0) > 0;
}

async function stamp(vaultId: string, identity: string): Promise<void> {
  if (!sqlAdmin) return;
  const meta: Meta = { identity, stamped_at: new Date().toISOString() };
  await sqlAdmin`
    UPDATE vaults SET embedding_meta = ${JSON.stringify(meta)}
    WHERE id = ${vaultId}`;
}

/**
 * Verify the vault's recorded embedder matches the active provider's,
 * stamping unstamped vaults along the way. Throws HttpError 409
 * `embedding_mismatch` when the vault's index was built by a different
 * model than the one now configured.
 */
export async function ensureVaultEmbedder(vaultId: string): Promise<void> {
  const current = await embeddingIdentity();

  const hit = verified.get(vaultId);
  if (hit && hit.identity === current && Date.now() - hit.at < CACHE_TTL_MS)
    return;

  if (!sqlAdmin) return; // no admin pool → cannot read metadata; don't block

  const [row] = await sqlAdmin<{ embedding_meta: unknown }[]>`
    SELECT embedding_meta FROM vaults WHERE id = ${vaultId} LIMIT 1`;
  if (!row) throw new HttpError(404, "vault_not_found");

  let meta = decodeMeta(row.embedding_meta);

  if (!meta) {
    // Unstamped vault. If it already holds vectors they predate the
    // provider layer, which means embeddinggemma built them; otherwise
    // the vault is fresh and adopts whatever embedder is active now.
    const legacy = await vaultHasVectors(vaultId);
    meta = {
      identity: legacy ? LEGACY_IDENTITY : current,
      stamped_at: new Date().toISOString(),
    };
    await stamp(vaultId, meta.identity);
  }

  if (meta.identity !== current) {
    throw new HttpError(
      409,
      `${EMBEDDING_MISMATCH}: this archive is indexed with ${meta.identity} ` +
        `but the active embedding model is ${current}. Run ` +
        `scripts/reindex-embeddings.ts (or switch the embedding settings ` +
        `back) before adding or searching memories.`,
    );
  }

  verified.set(vaultId, { identity: current, at: Date.now() });
}

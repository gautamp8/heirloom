import { z } from "zod";
import { sqlAdmin } from "../db";

/**
 * Provider profiles.
 *
 *  local        Ollama on this machine. The default, and the only profile
 *               the shipped desktop app uses out of the box.
 *  byok         The user brought their own key for an OpenAI-compatible
 *               endpoint (OpenRouter by default). Synthesis and photo
 *               captions run on that endpoint; embeddings stay local
 *               unless the user explicitly opts into cloud embeddings.
 *  hosted-demo  Azure OpenAI, configured entirely through env vars on the
 *               demo host. Never surfaced in the app's settings UI.
 *
 * Profile selection: `HEIRLOOM_PROVIDER_PROFILE=hosted-demo` wins (demo
 * VM); otherwise a saved-and-enabled BYOK config switches the instance to
 * `byok`; otherwise `local`.
 */
export type ProviderProfile = "local" | "byok" | "hosted-demo";

export type ModelTarget =
  | { kind: "ollama"; baseURL: string; model: string }
  | {
      kind: "openai-compatible";
      baseURL: string;
      apiKey: string;
      model: string;
    }
  | { kind: "azure"; endpoint: string; apiKey: string; deployment: string };

export type ResolvedProvider = {
  profile: ProviderProfile;
  synthesis: ModelTarget;
  /** Photo captioning. Same target as synthesis unless overridden. */
  vision: ModelTarget;
  embedding: ModelTarget;
  /** All profiles must produce 768-dim vectors — the pgvector columns are
   *  VECTOR(768) and sqlite-vec blobs are compared pairwise. OpenAI's
   *  text-embedding-3 family supports `dimensions: 768` natively. */
  embeddingDims: number;
  /** Stable identity string stored in vault metadata so a vault indexed
   *  with one embedder is never queried with another. */
  embeddingIdentity: string;
  /** Cosine-similarity floor for the reflection grounding gate. Scoped to
   *  the embedding model because cosine geometry differs per model. */
  retrievalFloor: number;
};

export const BYOK_SETTINGS_KEY = "provider.byok";

/** What a creator can save under Settings → Bring your own key. The key
 *  never leaves this machine's database; GETs return it masked. */
export const ByokSettingsSchema = z.object({
  enabled: z.boolean(),
  base_url: z.string().url().default("https://openrouter.ai/api/v1"),
  api_key: z.string().min(8),
  synthesis_model: z.string().min(1),
  /** Defaults to synthesis_model; some providers split text/vision models. */
  vision_model: z.string().min(1).optional(),
  embeddings: z
    .discriminatedUnion("mode", [
      z.object({ mode: z.literal("local") }),
      z.object({
        mode: z.literal("cloud"),
        model: z.string().min(1),
        /** Embeddings can point at a different OpenAI-compatible host than
         *  synthesis (e.g. OpenRouter for chat + OpenAI for embeddings). */
        base_url: z.string().url().optional(),
        api_key: z.string().min(8).optional(),
      }),
    ])
    .default({ mode: "local" }),
});

export type ByokSettings = z.infer<typeof ByokSettingsSchema>;

/** Retrieval floors per embedding identity.
 *
 *  Method: run the 40-fixture Sagan grounding eval (must-answer,
 *  must-refuse and safe pairs) against a live instance on the profile
 *  being calibrated, with `HEIRLOOM_RETRIEVAL_FLOOR` overriding this
 *  table, and pick the floor that refuses every must-refuse without
 *  losing a must-answer. The must-answer set survives a high floor
 *  because the hybrid gate's second leg — lexical overlap — carries the
 *  questions whose vector match is weak; the floor only has to be high
 *  enough to stop a topically-adjacent chunk from answering on its own.
 *
 *  Measured 2026-07-22, both profiles, same fixtures. The bands overlap
 *  on every embedder tried, which is why the gate is hybrid rather than
 *  a threshold alone:
 *
 *  embeddinggemma (local): must-answer 0.270-0.608, must-refuse
 *  0.192-0.420. At 0.30, "What did Carl say about his time in
 *  Antarctica?" matched Apollo/Earth-from-space chunks at 0.420 and
 *  answered about the Moon instead of refusing — a fabrication on the
 *  DEFAULT profile. 0.43 sits above that band, so the vector leg can no
 *  longer carry a topically-adjacent chunk on its own.
 *
 *  The cost is one over-refusal: "What was his full name?" retrieves at
 *  0.270 and its identity chunk does not make the top-5, so it now
 *  refuses. It had been passing only by accident — its token "full"
 *  substring-matched inside "wonderfully" before the lexical gate was
 *  anchored to word starts. Trading a false refusal for a fabrication is
 *  the direction this contract is meant to fail in.
 *
 *  azure/text-embedding-3-small (hosted demo): must-answer 0.225-0.691,
 *  must-refuse 0.195-0.431. Measured on the live demo, 0.30 already
 *  refuses every must-refuse — its highest-scoring near-misses
 *  (identity_born 0.431, antarctica 0.387) are caught downstream by the
 *  citation validator — so it is left alone rather than raised on
 *  speculation. Re-measure if the deployment's embedding model changes.
 */
const RETRIEVAL_FLOORS: Record<string, number> = {
  "ollama/embeddinggemma@768": 0.43,
  "azure/text-embedding-3-small@768": 0.3,
  "openai/text-embedding-3-small@768": 0.3,
};

/** Floor used when an identity has not been calibrated yet. Matches the
 *  embeddinggemma floor so the local profile's behavior is unchanged. */
const DEFAULT_RETRIEVAL_FLOOR = 0.3;

function retrievalFloorFor(identity: string): number {
  const override = process.env.HEIRLOOM_RETRIEVAL_FLOOR;
  if (override && Number.isFinite(Number(override))) return Number(override);
  return RETRIEVAL_FLOORS[identity] ?? DEFAULT_RETRIEVAL_FLOOR;
}

const OLLAMA_BASE = () =>
  process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

function localProvider(): ResolvedProvider {
  const synthesis: ModelTarget = {
    kind: "ollama",
    baseURL: OLLAMA_BASE(),
    model: process.env.OLLAMA_SYNTHESIS_MODEL ?? "gemma4:e4b",
  };
  const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL ?? "embeddinggemma";
  const identity = `ollama/${embeddingModel}@768`;
  return {
    profile: "local",
    synthesis,
    vision: synthesis,
    embedding: { kind: "ollama", baseURL: OLLAMA_BASE(), model: embeddingModel },
    embeddingDims: 768,
    embeddingIdentity: identity,
    retrievalFloor: retrievalFloorFor(identity),
  };
}

function hostedDemoProvider(): ResolvedProvider {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/$/, "");
  const apiKey = process.env.AZURE_OPENAI_API_KEY ?? "";
  const chat = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT ?? "";
  const embed = process.env.AZURE_OPENAI_EMBED_DEPLOYMENT ?? "";
  if (!endpoint || !apiKey || !chat || !embed) {
    throw new Error(
      "hosted-demo profile needs AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, " +
        "AZURE_OPENAI_CHAT_DEPLOYMENT and AZURE_OPENAI_EMBED_DEPLOYMENT",
    );
  }
  // Identity uses the underlying model name (not the deployment name) so a
  // renamed deployment of the same model doesn't force a reindex.
  const embedModelName =
    process.env.AZURE_OPENAI_EMBED_MODEL ?? "text-embedding-3-small";
  const identity = `azure/${embedModelName}@768`;
  const synthesis: ModelTarget = {
    kind: "azure",
    endpoint,
    apiKey,
    deployment: chat,
  };
  return {
    profile: "hosted-demo",
    synthesis,
    vision: synthesis,
    embedding: { kind: "azure", endpoint, apiKey, deployment: embed },
    embeddingDims: 768,
    embeddingIdentity: identity,
    retrievalFloor: retrievalFloorFor(identity),
  };
}

function byokProvider(byok: ByokSettings): ResolvedProvider {
  const synthesis: ModelTarget = {
    kind: "openai-compatible",
    baseURL: byok.base_url.replace(/\/$/, ""),
    apiKey: byok.api_key,
    model: byok.synthesis_model,
  };
  const vision: ModelTarget = byok.vision_model
    ? { ...synthesis, model: byok.vision_model }
    : synthesis;

  let embedding: ModelTarget;
  let identity: string;
  if (byok.embeddings.mode === "cloud") {
    embedding = {
      kind: "openai-compatible",
      baseURL: (byok.embeddings.base_url ?? byok.base_url).replace(/\/$/, ""),
      apiKey: byok.embeddings.api_key ?? byok.api_key,
      model: byok.embeddings.model,
    };
    identity = `openai/${byok.embeddings.model}@768`;
  } else {
    const local = localProvider();
    embedding = local.embedding;
    identity = local.embeddingIdentity;
  }

  return {
    profile: "byok",
    synthesis,
    vision,
    embedding,
    embeddingDims: 768,
    embeddingIdentity: identity,
    retrievalFloor: retrievalFloorFor(identity),
  };
}

/** Read the saved BYOK settings, tolerating both JSONB (postgres) and
 *  TEXT-JSON (sqlite) storage. Returns null when unset or invalid. */
export async function readByokSettings(): Promise<ByokSettings | null> {
  if (!sqlAdmin) return null;
  try {
    const rows = await sqlAdmin<{ value: unknown }[]>`
      SELECT value FROM app_settings WHERE key = ${BYOK_SETTINGS_KEY} LIMIT 1`;
    if (rows.length === 0) return null;
    const raw =
      typeof rows[0].value === "string"
        ? JSON.parse(rows[0].value)
        : rows[0].value;
    const parsed = ByokSettingsSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    // Table missing (pre-migration database) or unreadable — behave as if
    // no BYOK settings exist rather than taking the app down.
    return null;
  }
}

let cache: { value: ResolvedProvider; at: number } | null = null;
const CACHE_TTL_MS = 15_000;

/** Drop the cached resolution — called when BYOK settings change. */
export function invalidateProviderCache() {
  cache = null;
}

export async function resolveProvider(): Promise<ResolvedProvider> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  let resolved: ResolvedProvider;
  if (process.env.HEIRLOOM_PROVIDER_PROFILE === "hosted-demo") {
    resolved = hostedDemoProvider();
  } else {
    const byok = await readByokSettings();
    resolved = byok?.enabled ? byokProvider(byok) : localProvider();
  }

  cache = { value: resolved, at: Date.now() };
  return resolved;
}

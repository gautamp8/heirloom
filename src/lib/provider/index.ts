import { createOllama } from "ollama-ai-provider-v2";
import { createAzure } from "@ai-sdk/azure";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModel, LanguageModel } from "ai";
import {
  resolveProvider,
  type ModelTarget,
  type ResolvedProvider,
} from "./config";

export {
  resolveProvider,
  invalidateProviderCache,
  readByokSettings,
  ByokSettingsSchema,
  BYOK_SETTINGS_KEY,
  type ProviderProfile,
  type ResolvedProvider,
  type ByokSettings,
} from "./config";

function languageModelFor(target: ModelTarget): LanguageModel {
  switch (target.kind) {
    case "ollama":
      return createOllama({ baseURL: `${target.baseURL}/api` })(target.model);
    case "openai-compatible":
      return createOpenAICompatible({
        name: "byok",
        baseURL: target.baseURL,
        apiKey: target.apiKey,
      })(target.model);
    case "azure":
      return createAzure({
        baseURL: `${target.endpoint}/openai`,
        apiKey: target.apiKey,
      })(target.deployment);
  }
}

type EmbeddingHandle = {
  model: EmbeddingModel;
  /** Passed straight through to embed()/embedMany(). Cloud targets pin
   *  `dimensions` so every profile produces 768-dim vectors. */
  providerOptions?: Record<string, Record<string, number>>;
};

function embeddingModelFor(p: ResolvedProvider): EmbeddingHandle {
  const target = p.embedding;
  switch (target.kind) {
    case "ollama":
      return {
        model: createOllama({
          baseURL: `${target.baseURL}/api`,
        }).textEmbeddingModel(target.model),
      };
    case "openai-compatible":
      return {
        model: createOpenAICompatible({
          name: "byok",
          baseURL: target.baseURL,
          apiKey: target.apiKey,
        }).textEmbeddingModel(target.model),
        providerOptions: { byok: { dimensions: p.embeddingDims } },
      };
    case "azure":
      return {
        model: createAzure({
          baseURL: `${target.endpoint}/openai`,
          apiKey: target.apiKey,
        }).textEmbeddingModel(target.deployment),
        providerOptions: { openai: { dimensions: p.embeddingDims } },
      };
  }
}

/** The model used for reflection synthesis, tagging and prompts. */
export async function synthesisModel(): Promise<LanguageModel> {
  return languageModelFor((await resolveProvider()).synthesis);
}

/** The model used for photo captioning. */
export async function visionModel(): Promise<LanguageModel> {
  return languageModelFor((await resolveProvider()).vision);
}

/** The embedding model plus the providerOptions it needs. */
export async function embeddingHandle(): Promise<EmbeddingHandle> {
  return embeddingModelFor(await resolveProvider());
}

/** Cosine floor for the reflection grounding gate, scoped to the active
 *  embedding model. */
export async function retrievalFloor(): Promise<number> {
  return (await resolveProvider()).retrievalFloor;
}

/** Stable identity of the active embedder, e.g. "ollama/embeddinggemma@768".
 *  Stored in vault metadata; a vault indexed with one embedder must never
 *  be queried with another. */
export async function embeddingIdentity(): Promise<string> {
  return (await resolveProvider()).embeddingIdentity;
}

/** Human-readable, secret-free description for health checks and the
 *  transparency page. */
export async function describeProvider(): Promise<{
  profile: string;
  synthesis: string;
  vision: string;
  embedding: string;
}> {
  const p = await resolveProvider();
  const label = (t: ModelTarget) =>
    t.kind === "azure"
      ? `azure/${t.deployment}`
      : t.kind === "openai-compatible"
        ? `${new URL(t.baseURL).hostname}/${t.model}`
        : `ollama/${t.model}`;
  return {
    profile: p.profile,
    synthesis: label(p.synthesis),
    vision: label(p.vision),
    embedding: p.embeddingIdentity,
  };
}

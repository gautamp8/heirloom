import { createOllama } from "ollama-ai-provider-v2";

const baseURL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

export const ollama = createOllama({ baseURL: `${baseURL}/api` });

export const SYNTHESIS_MODEL =
  process.env.OLLAMA_SYNTHESIS_MODEL ?? "gemma4:e4b";

export const EMBEDDING_MODEL =
  process.env.OLLAMA_EMBEDDING_MODEL ?? "embeddinggemma";

/** Reach the Ollama daemon for a liveness check. */
export async function ollamaVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${baseURL}/api/version`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

/** List models currently in the local Ollama registry. */
export async function ollamaTags(): Promise<string[]> {
  try {
    const res = await fetch(`${baseURL}/api/tags`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name: string }[] };
    return data.models?.map((m) => m.name) ?? [];
  } catch {
    return [];
  }
}

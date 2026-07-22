/** Liveness helpers for the local Ollama daemon. Model selection and
 *  inference live in `src/lib/provider` — this module only answers
 *  "is the daemon up and what has it pulled", which the health route
 *  and the desktop splash rely on. */

const baseURL = () => process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

/** Reach the Ollama daemon for a liveness check. */
export async function ollamaVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${baseURL()}/api/version`, { cache: "no-store" });
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
    const res = await fetch(`${baseURL()}/api/tags`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name: string }[] };
    return data.models?.map((m) => m.name) ?? [];
  } catch {
    return [];
  }
}

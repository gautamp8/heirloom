import { embed, embedMany } from "ai";
import { ollama, EMBEDDING_MODEL } from "./ollama";

/** Embed a single string (e.g. a Reflection query). */
export async function embedOne(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: ollama.textEmbeddingModel(EMBEDDING_MODEL),
    value: text,
  });
  return embedding;
}

/** Embed many strings in parallel (each chunk of a capture transcript). */
export async function embedAll(values: string[]): Promise<number[][]> {
  if (values.length === 0) return [];
  const { embeddings } = await embedMany({
    model: ollama.textEmbeddingModel(EMBEDDING_MODEL),
    values,
  });
  return embeddings;
}

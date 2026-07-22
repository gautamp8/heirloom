import { embed, embedMany } from "ai";
import { embeddingHandle } from "./provider";

/** Embed a single string (e.g. a Reflection query). */
export async function embedOne(text: string): Promise<number[]> {
  const { model, providerOptions } = await embeddingHandle();
  const { embedding } = await embed({ model, value: text, providerOptions });
  return embedding;
}

/** Embed many strings in parallel (each chunk of a capture transcript). */
export async function embedAll(values: string[]): Promise<number[][]> {
  if (values.length === 0) return [];
  const { model, providerOptions } = await embeddingHandle();
  const { embeddings } = await embedMany({ model, values, providerOptions });
  return embeddings;
}

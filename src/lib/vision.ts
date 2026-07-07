import { promises as fs } from "node:fs";
import path from "node:path";
import { generateText } from "ai";
import { resolveProvider, visionModel } from "./provider";

export type RecognizedPerson = { display_name: string };

function buildSystemPrompt(people: RecognizedPerson[]): string {
  const namesList = people.map((p) => p.display_name).join(", ");
  return [
    "You describe family photographs for an archival memory system.",
    "Voice: third person, calm, observational. One paragraph, 1–3 sentences.",
    people.length > 0
      ? `IMPORTANT: This photo contains ${namesList}. You MUST refer to ${
          people.length === 1 ? "them" : "each of them"
        } by name. Do not use generic descriptions like "a woman" or "a young man" when a name is available. Begin with their name.`
      : "Describe the people factually (their clothing, posture, what they are doing).",
    "Note light, setting, mood, clothing, objects. Avoid speculation about feelings.",
    "Do not invent details that are not visible. Do not mention 'the image' or 'photograph'.",
  ]
    .filter(Boolean)
    .join("\n");
}

const MEDIA_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
};

/** Describe a photo in archival third-person voice. When `people` is
 *  provided, the system prompt names them so the caption reads "Rita
 *  holding a cup" instead of "a woman holding a cup".
 *
 *  Routed through the provider layer: the local profile talks to Ollama's
 *  native chat API (its multimodal request shape is the proven path for
 *  gemma4:e4b); cloud profiles go through the AI SDK with an image part. */
export async function captionPhoto(
  absPath: string,
  opts: { people?: RecognizedPerson[] } = {},
): Promise<string> {
  const buf = await fs.readFile(absPath);
  const people = opts.people ?? [];
  const system = buildSystemPrompt(people);
  const provider = await resolveProvider();

  if (provider.vision.kind === "ollama") {
    const body = {
      model: provider.vision.model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: "Describe what is in this photo.",
          images: [buf.toString("base64")],
        },
      ],
      stream: false,
      think: false,
      options: { num_predict: 180, temperature: 0.4, top_p: 0.9 },
    };
    const res = await fetch(`${provider.vision.baseURL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      throw new Error(`vision: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return (data.message?.content ?? "").trim();
  }

  const mediaType =
    MEDIA_TYPES[path.extname(absPath).toLowerCase()] ?? "image/jpeg";
  const { text } = await generateText({
    model: await visionModel(),
    system,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe what is in this photo." },
          { type: "image", image: buf, mediaType },
        ],
      },
    ],
    temperature: 0.4,
    maxOutputTokens: 260,
    abortSignal: AbortSignal.timeout(45_000),
  });
  return text.trim();
}

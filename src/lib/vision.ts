import { promises as fs } from "node:fs";
import { SYNTHESIS_MODEL } from "./ollama";

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

export type RecognizedPerson = { display_name: string };

/** Describe a photo via Gemma 4 vision. When `people` is provided,
 *  the system prompt names them so the caption reads "Anisha holding
 *  a cup" instead of "a woman holding a cup". Returns a single short
 *  paragraph in archival, third-person voice. */
export async function captionPhoto(
  absPath: string,
  opts: { people?: RecognizedPerson[] } = {},
): Promise<string> {
  const buf = await fs.readFile(absPath);
  const b64 = buf.toString("base64");

  const people = opts.people ?? [];
  const namesList = people.map((p) => p.display_name).join(", ");

  const system = [
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

  const body = {
    model: SYNTHESIS_MODEL,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: "Describe what is in this photo.",
        images: [b64],
      },
    ],
    stream: false,
    think: false,
    options: { num_predict: 180, temperature: 0.4, top_p: 0.9 },
  };

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
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

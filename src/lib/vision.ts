import { promises as fs } from "node:fs";
import { SYNTHESIS_MODEL } from "./ollama";

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

export type RecognizedPerson = {
  display_name: string;
  bbox: { x: number; y: number; w: number; h: number };
  similarity?: number;
};

/**
 * Describe a photo via Gemma 4 vision. When `people` is provided, the
 * system prompt tells the model who is in the image so the caption uses
 * names instead of generic descriptors ("Elena in a yellow dress" rather
 * than "a woman in a yellow dress").
 *
 * Empirically: 1–2s on M4 Pro with `think: false` and num_predict 120.
 * Returns a single short paragraph in archival, third-person voice.
 */
export async function captionPhoto(
  absPath: string,
  opts: { people?: RecognizedPerson[] } = {},
): Promise<string> {
  const buf = await fs.readFile(absPath);
  const b64 = buf.toString("base64");

  const peopleHint = (opts.people ?? []).length
    ? `Known people in this photo (use their names, do not invent others): ${
        opts.people!
          .map(
            (p) =>
              `${p.display_name} at [x=${p.bbox.x.toFixed(2)},y=${p.bbox.y.toFixed(2)}]`,
          )
          .join("; ")
      }`
    : null;

  const system = [
    "You describe family photographs for an archival memory system.",
    "Voice: third person, calm, observational. One paragraph, 1–3 sentences.",
    "Mention people by name when given; otherwise describe them factually.",
    "Note light, setting, mood, clothing, objects. Avoid speculation about feelings.",
    "Do not invent details that are not visible. Do not mention 'the image' or 'photograph'.",
    peopleHint,
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

  const t0 = Date.now();
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    throw new Error(`vision: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    message?: { content?: string };
    eval_count?: number;
  };
  const elapsed = Date.now() - t0;
  const caption = (data.message?.content ?? "").trim();
  console.log(
    `[vision] caption (${caption.length}ch, ${data.eval_count}t, ${elapsed}ms)`,
  );
  return caption;
}

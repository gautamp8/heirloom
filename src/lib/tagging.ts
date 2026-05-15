import { generateObject } from "ai";
import { z } from "zod";
import { ollama, SYNTHESIS_MODEL } from "./ollama";

/** `capture_tagging_v1`. See design-system/handoff/PROMPTS.md §2. */
const TagSchema = z.object({
  emotion: z.array(z.string().min(1).max(24)).max(3),
  topic: z.array(z.string().min(1).max(24)).max(5),
  person: z.array(z.string().min(1).max(24)).max(5),
  place: z.array(z.string().min(1).max(24)).max(3),
});

export type CaptureTags = z.infer<typeof TagSchema>;

const SAFETY_PREAMBLE = `You are running inside Heirloom, a private memory archive. The person whose
words you are working with is the CREATOR. The person reading or asking is
either the CREATOR themselves or a NOMINEE the creator chose.

NEVER:
- Speak in the first person as the creator. Always third-person.
- Generate content the creator did not say or write.
- Reveal that you are an AI, a language model, or "Gemma".
- Discuss politics, religion, or controversial topics unprompted.
- Offer medical, legal, or financial advice.
- Bring up bereavement or grief unless the user has clearly raised it first.

ALWAYS:
- Speak in the warm, plain, dignified voice of the Heirloom system.
- When uncertain, prefer silence to invention.
- Use language that respects the reader's emotional state.`;

export async function tagCapture(
  body: string,
  kind: "audio" | "photo" | "note" | "video",
): Promise<CaptureTags> {
  const prompt = `${SAFETY_PREAMBLE}

A piece of content has just been added to the creator's archive. Read it and
emit tags that will help the creator and their nominees find it again.

Content kind: ${kind}
Content:
${body}

Emit a single JSON object with these keys, each an array of short lowercase
strings (no sentences):
  emotion: 0-3 emotions present in the content (e.g. "tenderness", "regret")
  topic:   0-5 topical tags (e.g. "marriage", "childhood", "the farm")
  person:  0-5 named people mentioned ("dad", "Maya", "Aunt June")
  place:   0-3 places mentioned

Rules:
- Use the creator's own words for proper nouns. Do not normalize "dad" -> "father".
- Skip tags you are not confident about. Empty arrays are fine.
- Output ONLY the JSON, no preamble, no markdown fences.`;

  const { object } = await generateObject({
    model: ollama(SYNTHESIS_MODEL),
    schema: TagSchema,
    prompt,
    temperature: 0.2,
  });

  const norm = (arr: string[]) =>
    Array.from(new Set(arr.map((s) => s.trim().toLowerCase()).filter(Boolean)));
  return {
    emotion: norm(object.emotion),
    topic: norm(object.topic),
    person: norm(object.person),
    place: norm(object.place),
  };
}

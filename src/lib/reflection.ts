import { z } from "zod";

/**
 * Heirloom Reflection — the contract that makes "AI that speaks for the dead"
 * ethically defensible. Every line in this file is load-bearing for the
 * `Safety & Trust` story.
 *
 * Reference: design-system/handoff/PROMPTS.md §5, §6
 *            design-system/handoff/GUARDRAILS.md §2
 */

/** Hard similarity gate. If the best-matching chunk's cosine similarity is
 *  below this, the system returns the empty-state response *without ever
 *  calling Gemma 4*. Do not branch around this constant.
 *
 *  Calibrated empirically against EmbeddingGemma 300m: same-topic queries
 *  score 0.40–0.55, unrelated queries 0.10–0.30. The 0.55 default suggested
 *  in design-system/handoff/PROMPTS.md §5 was tuned for a different
 *  embedding model and rejects legitimate matches at our scale.
 *
 *  This threshold will need recalibration after Phase E.5 (seed corpus)
 *  lands more captures and the similarity baseline rises. Tracked in
 *  EXECUTION-PLAN.md "Deferred items". */
export const REFLECTION_SIMILARITY_THRESHOLD = 0.40;

/** Verbatim copy returned when no grounded answer exists. The string itself
 *  is part of the product contract — UI tests compare for exact equality. */
export const EMPTY_STATE_ANSWER =
  "I don't have that in the archive. Try asking another way?";

/** Output schema for the synthesis model. Every claim must cite at least
 *  one `capture_id` from the retrieved chunks. The runtime validator
 *  rejects responses that don't conform. */
export const ReflectionSchema = z.object({
  answer: z.string(),
  claims: z
    .array(
      z.object({
        text: z.string().min(1),
        citations: z.array(z.string().uuid()).min(1),
      }),
    )
    .min(0),
  tone: z.enum(["reflective", "practical", "tender", "playful"]).optional(),
});

export type ReflectionAnswer = z.infer<typeof ReflectionSchema>;

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

type RetrievedChunk = {
  capture_id: string;
  text: string;
  captured_at: Date | string;
  similarity: number;
};

/** Build the synthesis prompt with the retrieved chunks as the ONLY source
 *  of truth. The model is instructed to either ground every claim in a
 *  capture_id from this list or return the empty state verbatim. */
export function buildReflectionPrompt(
  question: string,
  creatorName: string,
  chunks: RetrievedChunk[],
): string {
  const memoryBlock = chunks
    .map((c, i) => {
      const at =
        c.captured_at instanceof Date
          ? c.captured_at.toISOString().slice(0, 10)
          : String(c.captured_at).slice(0, 10);
      return `[${i + 1}] capture_id=${c.capture_id} (captured ${at})\n${c.text}`;
    })
    .join("\n\n");

  return `${SAFETY_PREAMBLE}

A nominee is asking a question about the creator's archive. Your job is to
answer with what the creator actually said or wrote — never anything else.

The creator's name: ${creatorName}
The question: ${question}

Memories retrieved from the archive (these are the ONLY source of truth):
${memoryBlock}

Construct an answer as a JSON object matching this shape:
{
  "answer": "<2-5 sentences, third person, plain English>",
  "claims": [
    { "text": "<one claim from the answer>", "citations": ["<capture_id>", ...] }
  ],
  "tone": "<reflective|practical|tender|playful>"
}

Rules:
- Every claim's "citations" array must contain at least one capture_id from
  the retrieved memories above. Do NOT invent UUIDs.
- Never paraphrase beyond what the source supports. When in doubt, quote.
- Refer to the creator in the third person ("Your mother said…", "She wrote…").
  Do NOT speak as ${creatorName} ("I said…", "I believe…").
- If the retrieved memories do not actually answer the question, set
  "answer" to the EXACT string: "${EMPTY_STATE_ANSWER}" and "claims" to [].
- Output ONLY the JSON object. No markdown fences, no preamble.`;
}

/** Verify every cited capture_id appears in the retrieved chunk set. Gemma
 *  occasionally fabricates a UUID; this is the second line of defence. */
export function validateCitations(
  resp: ReflectionAnswer,
  retrieved: RetrievedChunk[],
): { ok: true } | { ok: false; reason: string } {
  const allowed = new Set(retrieved.map((c) => c.capture_id));
  for (const claim of resp.claims) {
    if (claim.citations.length === 0) {
      return { ok: false, reason: "claim_missing_citations" };
    }
    for (const id of claim.citations) {
      if (!allowed.has(id)) {
        return { ok: false, reason: `citation_not_in_retrieved:${id}` };
      }
    }
  }
  return { ok: true };
}

/** Detect first-person impersonation in text *outside* of quoted material.
 *  Quoted spans (straight or curly quotes) are allowed first-person because
 *  they're cited verbatim from the creator's own words. */
export function hasFirstPersonOutsideQuotes(text: string): boolean {
  // Strip out anything inside paired quotes
  const stripped = text.replace(/["“”][^"“”]*["“”]/g, "");
  return /\b(I|I'm|I've|I'll|I'd|me|my|mine)\b/i.test(stripped);
}

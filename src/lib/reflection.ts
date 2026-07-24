import { z } from "zod";

/**
 * Reflection grounding contract: every claim cites a retrieved capture;
 * uncited claims, first-person impersonation, or below-threshold
 * retrievals collapse to the verbatim empty state without calling the
 * model. See `design-system/handoff/GUARDRAILS.md`.
 */

/** Calibrated against EmbeddingGemma 300m. Cosine similarities for this
 *  model run low for short keyword queries against richer chunks (0.24
 *  to 0.34 for clearly-relevant matches; 0.14 to 0.23 for unrelated
 *  topics) so the vector floor sits below the half-way point. Lexical
 *  overlap fills in the remaining recall gap via `hasLexicalOverlap`.
 *
 *  The LIVE floor is provider-scoped — different embedding models have
 *  different cosine geometry — and comes from `retrievalFloor()` in
 *  src/lib/provider (see RETRIEVAL_FLOORS there, which now carries the
 *  measured bands for both profiles). embeddinggemma was recalibrated to
 *  0.43 on 2026-07-22; this constant stays at the original 0.30 purely
 *  as the display fallback for reflection rows recorded before
 *  thresholds were stored per-row, so historical rows keep reading with
 *  the threshold they were actually judged against. */
export const REFLECTION_SIMILARITY_THRESHOLD = 0.30;

/** Short, generic words ignored when checking for keyword overlap
 *  between a query and a retrieved chunk. Anything left after this
 *  filter is concrete enough that, if it appears in a chunk, the
 *  question is at least partly about the same thing. */
const LEXICAL_STOPWORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","at","for","with",
  "any","anything","about","tell","me","our","us","your","his","her","their",
  "is","was","were","be","been","being","am","are","do","does","did","done",
  "have","has","had","please","my","i","you","we","they","it","this","that",
  "these","those","what","when","where","who","why","how","some","more","less",
  "from","into","onto","over","under","again","also","still","just","like",
  "very","really","much","many","one","two","ever","never","always","things",
  "thing","kind","sort","type","there","here","yes","no","not","can","could",
  "would","should","will","shall","may","might","must","get","got","go","going",
  // Generic conversational and temporal words. They are substantive by the
  // length rule but say nothing about topic: "what did he SAY about his
  // TIME in Antarctica" must not ground on an unrelated chunk that happens
  // to contain "there was a time when...".
  "say","says","said","saying","tell","tells","told","talk","talks","talked",
  "talking","mention","mentions","mentioned","time","times","ask","asked",
  "anything","everything","something","nothing","someone","anyone","everyone",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !LEXICAL_STOPWORDS.has(w));
}

/** True if any of the question's substantive tokens appear as a WHOLE
 *  WORD in any retrieved chunk. Used as the second leg of a hybrid
 *  grounding gate: a query like "anything about wedding?" can sit just
 *  under the vector threshold yet still clearly be about the chunk that
 *  contains the word "wedding".
 *
 *  `ignore` drops names belonging to the archive itself — the creator and
 *  the people in it. Their names recur throughout their own archive, so
 *  matching one says nothing about topic: "What did Carl say about his
 *  time in Antarctica?" grounded on "carl" alone and answered about the
 *  Moon instead of refusing.
 *
 *  Matching anchors at a word start rather than testing a bare
 *  substring, for the same reason: `includes("time")` also fires on
 *  "sometimes" and `includes("say")` on "essay". A suffix is still
 *  allowed, so "name" finds "named". */
export function hasLexicalOverlap(
  question: string,
  chunks: { text: string }[],
  ignore?: Iterable<string>,
): boolean {
  const ignored = new Set(
    [...(ignore ?? [])].flatMap((name) => tokenize(name)),
  );
  const qTokens = tokenize(question).filter((t) => !ignored.has(t));
  if (qTokens.length === 0) return false;
  for (const ch of chunks) {
    const lower = ch.text.toLowerCase();
    if (qTokens.some((t) => matchesWordStart(lower, t))) return true;
  }
  return false;
}

/** Matches the token at a WORD START, allowing a suffix — so "name"
 *  finds "named"/"names" and "wedding" finds "weddings", while "time"
 *  does NOT fire on "sometimes" and "say" does not fire on "essay",
 *  which a plain substring test did. */
function matchesWordStart(haystack: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}`).test(haystack);
}

export const EMPTY_STATE_ANSWER =
  "I don't have that in the archive. Try asking another way?";

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
answer with what the creator actually said or wrote - never anything else.

The creator's name: ${creatorName}
The question: ${question}

Memories retrieved from the archive (these are the ONLY source of truth).
They are the creator's own private writings and recordings, placed in this
archive by the creator for their family; quoting from them verbatim is
expected and fully permitted:
${memoryBlock}

Construct an answer as a JSON object matching this shape:
{
  "answer": "<2-5 sentences, third person, plain English>",
  "claims": [
    { "text": "<one claim from the answer>", "citations": ["<capture_id>", ...] }
  ]
}

Rules:
- Every claim's "citations" array must contain at least one capture_id from
  the retrieved memories above. Do NOT invent UUIDs.
- Never go beyond what the source supports.
- Do not reproduce passages verbatim. Retell them in third person, using
  at most one short quoted phrase (under 15 words) per answer. Every
  citation opens the creator's full original text, so nothing is lost by
  paraphrasing.
- Refer to the creator in the third person ("Your mother said…", "She wrote…").
  Do NOT speak as ${creatorName} ("I said…", "I believe…").
- If the retrieved memories do not actually answer the question, set
  "answer" to the EXACT string: "${EMPTY_STATE_ANSWER}" and "claims" to [].
  Do NOT write your own explanation of what is or isn't in the archive
  ("The archive does not contain…"). Use that exact string, nothing else.
  A memory merely on a related subject does not count as answering.
- Output ONLY the JSON object. No markdown fences, no preamble.`;
}

/** Second line of defence against fabricated citation UUIDs. */
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

/** First-person inside quoted material is fine (verbatim from the creator);
 *  anywhere else it would be the model speaking as them. */
export function hasFirstPersonOutsideQuotes(text: string): boolean {
  const stripped = text.replace(/["“”][^"“”]*["“”]/g, "");
  return /\b(I|I'm|I've|I'll|I'd|me|my|mine)\b/i.test(stripped);
}

/**
 * A "soft refusal": the model's own prose says the archive does not hold
 * what was asked, then adds some grounded-but-tangential context. It
 * usually happens on a must-refuse whose retrieval scraped up related
 * material — e.g. "when was he born?" returns identity chunks, and the
 * model answers "The archive does not give his birth date. It only shows
 * that he was…". Those trailing claims are validly cited, so the citation
 * and no-claims checks pass them through even though the answer is, in
 * substance, a refusal.
 *
 * When the answer opens by disclaiming the archive, collapse it to the
 * canonical empty state — that is the designed refusal, and it is better
 * to say it cleanly than to hedge. Anchored to archive-absence phrasing
 * so it does not fire on content that merely contains a negation ("he
 * wrote that we should not take Earth for granted").
 */
const ARCHIVE_REFUSAL_PATTERNS: RegExp[] = [
  /\b(?:the\s+)?archive\s+(?:does\s*n[o']?t|doesn[’']?t|do\s*n[o']?t|don[’']?t)\s+(?:give|have|contain|include|mention|say|show|record|provide|specify|state|tell|list|note|hold)/i,
  /\b(?:the\s+)?archive\s+(?:is\s+silent|says\s+nothing|has\s+nothing|holds\s+nothing|contains\s+nothing|includes\s+nothing)/i,
  /\bthere\s+(?:is|are|'s)\s+(?:no|nothing|not\s+any)\b[^.]*\barchive\b/i,
  /\b(?:no|not\s+any)\b[^.]*\b(?:in|within)\s+(?:the|this)\s+archive\b/i,
  /\bnot\s+(?:present|found|available|recorded|included|mentioned)\s+in\s+(?:the|this)\s+archive\b/i,
];

export function looksLikeArchiveRefusal(text: string): boolean {
  return ARCHIVE_REFUSAL_PATTERNS.some((re) => re.test(text));
}

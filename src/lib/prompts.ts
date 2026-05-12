/**
 * Short, fast Gemma 4 calls for inline assistive copy:
 *  - prompt-of-day: rotating reflective prompt on the creator home
 *  - note title:    a 3–6 word headline derived from the body of a note
 *
 * Both target the smaller variant (gemma4:e4b) for sub-second latency,
 * use temperature ~0.7 for variation, and strip quoting / preambles.
 */

import { generateText } from "ai";
import { ollama, SYNTHESIS_MODEL } from "./ollama";

const SAFETY_PREAMBLE = `You are running inside Heirloom, a private memory archive. Speak in the
warm, plain, dignified voice of the Heirloom system. Never use exclamation
points. Never use emoji. Never reveal you are an AI or "Gemma". Never
bring up bereavement or grief uninvited.`;

const FALLBACK_PROMPTS = [
  "The first time you remember feeling proud of yourself.",
  "A smell from your grandmother's kitchen.",
  "Something small you do that no one else knows about.",
  "What you wore the day everything changed.",
  "What you want them to know when they're tired.",
  "A song that always finds your way back to you.",
  "The chair in your childhood house no one else liked.",
  "A piece of advice you keep but never say aloud.",
];

/**
 * Generate one reflective prompt. Fresh on each call by design — the
 * variation IS the value. Falls back to a static pick if Gemma is slow
 * or unavailable so the home never hangs.
 */
export async function generatePromptOfDay(opts: {
  recentTopics?: string[];
  recentCount?: number;
}): Promise<string> {
  const topics = (opts.recentTopics ?? []).slice(0, 6).join(", ") || "none yet";
  const recent = opts.recentCount ?? 0;
  const day = new Date().toLocaleDateString("en-US", { weekday: "long" });

  const prompt = `${SAFETY_PREAMBLE}

You are writing today's prompt for the creator of a memory archive. It
should feel like a thoughtful friend asking — not a productivity app.
One sentence only.

Their archive has ${recent} recent pieces.
Topics they've been exploring: ${topics}.
Today is ${day}.

Write one prompt. Bias toward small, concrete memories ("a smell from
your grandmother's kitchen", "what you wore the day you proposed") over
abstract ones ("describe your values"). Keep to 6–18 words.

Output: just the prompt sentence. No quotes, no "Today's prompt:",
no markdown.`;

  try {
    const { text } = await generateText({
      model: ollama(SYNTHESIS_MODEL),
      prompt,
      temperature: 0.85,
      maxOutputTokens: 60,
      abortSignal: AbortSignal.timeout(8000),
    });
    return cleanSentence(text) || fallbackPrompt();
  } catch {
    return fallbackPrompt();
  }
}

function fallbackPrompt(): string {
  return FALLBACK_PROMPTS[Math.floor(Math.random() * FALLBACK_PROMPTS.length)];
}

/**
 * Generate a 3–6 word title for a note body. Used when the creator
 * doesn't supply one. Returns null if Gemma is unhelpful so callers can
 * fall back to "Untitled" or the note's first clause.
 */
export async function generateNoteTitle(body: string): Promise<string | null> {
  const trimmed = body.trim();
  if (trimmed.length < 12) return null;

  const prompt = `${SAFETY_PREAMBLE}

The creator has written a memory in their archive. Give it a short title
in the creator's own register — not a summary, not a label, just the kind
of phrase the creator might write at the top of a page.

The memory:
${trimmed.slice(0, 800)}

Write 3 to 6 words. No period at the end. No quotes. No "Title:" prefix.
Match the warmth and concreteness of the source. Use the creator's own
proper nouns (do not normalise "dad" -> "father").`;

  try {
    const { text } = await generateText({
      model: ollama(SYNTHESIS_MODEL),
      prompt,
      temperature: 0.5,
      maxOutputTokens: 40,
      abortSignal: AbortSignal.timeout(6000),
    });
    const cleaned = cleanSentence(text).replace(/[.!?]+$/g, "");
    if (!cleaned) return null;
    // Cap at 8 words just in case
    const words = cleaned.split(/\s+/);
    if (words.length > 8) return null;
    return cleaned;
  } catch {
    return null;
  }
}

/** Strip surrounding quotes, drop preamble like "Prompt:" / "Title:", trim. */
function cleanSentence(t: string): string {
  return t
    .trim()
    .replace(/^["“”'`]+|["“”'`]+$/g, "")
    .replace(/^(prompt|today'?s? prompt|title)\s*[:\-—]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

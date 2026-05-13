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

/** Generate one reflective prompt. Falls back to a static pick if
 *  Gemma is unavailable so the home never hangs. */
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

/** Generate a 3–6 word title for a note body. Returns null when
 *  Gemma is unhelpful; callers fall back to "Untitled" or the first
 *  clause. */
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

/** Occasion prompts for the onboarding "seed letters" step. Each draft
 *  carries a nominee, an occasion prompt for the creator, and a
 *  free-text trigger that the condition engine later maps into one of
 *  {date, life_event, state, semantic_match}. */
export type SeedLetterDraft = {
  to: string; // nominee display name
  prompt: string; // occasion prompt for the creator
  trigger: string; // short text describing when it should unlock
};

const FALLBACK_SEED_LETTERS = (nomineeName: string): SeedLetterDraft[] => [
  {
    to: nomineeName,
    prompt: `What you want ${nomineeName} to hear when they're feeling defeated.`,
    trigger: "When they feel lost",
  },
  {
    to: nomineeName,
    prompt: `Something for ${nomineeName} on their wedding day.`,
    trigger: "On their wedding day",
  },
  {
    to: nomineeName,
    prompt: `On the first anniversary they spend without you, what should they remember?`,
    trigger: "On the anniversary of loss",
  },
  {
    to: nomineeName,
    prompt: `The first thing you want ${nomineeName} to know when they open this archive.`,
    trigger: "On first opening this archive",
  },
  {
    to: nomineeName,
    prompt: `For when ${nomineeName} misses you.`,
    trigger: "When they miss you",
  },
];

export async function generateSeedLetterPrompts(opts: {
  nominees: { name: string; relation?: string | null }[];
  creatorName: string;
}): Promise<SeedLetterDraft[]> {
  const first = opts.nominees[0];
  if (!first) return [];

  const list = opts.nominees
    .map((n) => `${n.name}${n.relation ? ` (${n.relation})` : ""}`)
    .join(", ");

  const prompt = `${SAFETY_PREAMBLE}

You are helping ${opts.creatorName} seed the archive with a handful of
sealed-letter occasions — moments when each nominee should hear something
specific from them. Write 5 occasion prompts. Each prompt should:
- Be addressed to ONE specific nominee by name.
- Describe a clear moment (a feeling, a milestone, a date).
- Be open enough that the creator could record a 30-second response.
- Bias toward emotional grounding rather than advice ("for when you're
  lost", "on your wedding day", "the first thing to know when you open
  this") over generic ("share your wisdom").

Nominees to write for: ${list}.

Output strict JSON only, an array of 5 objects with keys "to" (string,
the nominee's name), "prompt" (string, the occasion), and "trigger"
(string, a 2-4 word phrase describing when it should unlock — e.g. "When
they feel lost", "On their wedding day", "On their 18th birthday", "On
the anniversary of loss", "When they miss you"). No prose around the JSON.`;

  try {
    const { text } = await generateText({
      model: ollama(SYNTHESIS_MODEL),
      prompt,
      temperature: 0.7,
      maxOutputTokens: 600,
      abortSignal: AbortSignal.timeout(20000),
    });
    const parsed = extractJsonArray(text);
    const drafts = parsed
      .filter(
        (
          o: unknown,
        ): o is { to: string; prompt: string; trigger?: string } =>
          !!o &&
          typeof (o as { to?: unknown }).to === "string" &&
          typeof (o as { prompt?: unknown }).prompt === "string",
      )
      .map((o) => ({
        to: o.to.trim(),
        prompt: cleanSentence(o.prompt),
        trigger: cleanSentence((o.trigger ?? "When the moment comes").toString()),
      }))
      .slice(0, 7);
    if (drafts.length >= 3) return drafts;
    return FALLBACK_SEED_LETTERS(first.name);
  } catch {
    return FALLBACK_SEED_LETTERS(first.name);
  }
}

/** Extract the first JSON array from a model response that may have prose. */
function extractJsonArray(s: string): unknown[] {
  const trimmed = s.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const value = JSON.parse(trimmed.slice(start, end + 1));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

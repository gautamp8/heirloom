import { withRls } from "@/lib/db";
import { errorResponse, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FALLBACK_PROMPTS = [
  "The first time you remember feeling proud of yourself.",
  "A smell from your grandmother's kitchen.",
  "Something small you do that no one else knows about.",
  "What you wore the day everything changed.",
  "What you want them to know when they're tired.",
  "A song that always finds its way back to you.",
];

function timeOfDay(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function pickPrompt(date: Date, seed: string): string {
  const day = date.getUTCFullYear() * 1000 + date.getUTCMonth() * 32 + date.getUTCDate();
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return FALLBACK_PROMPTS[(day + h) % FALLBACK_PROMPTS.length];
}

export async function GET() {
  try {
    const session = await requireSession();

    const data = await withRls(session.user_id, session.role, async (tx) => {
      const [user] = await tx<{ display_name: string }[]>`
        SELECT display_name FROM users WHERE id = ${session.user_id}
      `;
      const recent = await tx<
        {
          id: string;
          kind: "audio" | "photo" | "note" | "video";
          status: "processing" | "ready" | "failed";
          title: string | null;
          body: string | null;
          duration_ms: number | null;
          captured_at: Date;
          transcript_snippet: string | null;
        }[]
      >`
        SELECT c.id, c.kind, c.status, c.title, c.body, c.duration_ms, c.captured_at,
               LEFT(COALESCE(c.body, t.text, ''), 240) AS transcript_snippet
        FROM captures c
        LEFT JOIN transcripts t ON t.capture_id = c.id
        WHERE c.vault_id = ${session.vault_id}
        ORDER BY c.captured_at DESC
        LIMIT 12
      `;
      const [counts] = await tx<{ captures: number; nominees: number }[]>`
        SELECT
          (SELECT COUNT(*)::int FROM captures WHERE vault_id = ${session.vault_id}) AS captures,
          (SELECT COUNT(*)::int FROM nominees WHERE vault_id = ${session.vault_id}) AS nominees
      `;
      return { user, recent, counts };
    });

    return Response.json({
      greeting: {
        time_of_day: timeOfDay(),
        display_name: data.user.display_name,
      },
      prompt_of_day: {
        id: "fallback",
        text: pickPrompt(new Date(), session.vault_id),
      },
      recent_captures: data.recent,
      stats: data.counts,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

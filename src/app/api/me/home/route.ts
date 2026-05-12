import { sqlAdmin, withRls } from "@/lib/db";
import { errorResponse, requireSession } from "@/lib/auth";
import { generatePromptOfDay } from "@/lib/prompts";

export const dynamic = "force-dynamic";

function timeOfDay(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

export async function GET() {
  try {
    const session = await requireSession();

    if (session.role === "creator") {
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
        const recentTopics = await tx<{ value: string }[]>`
          SELECT DISTINCT value
          FROM capture_tags ct
          JOIN captures c ON c.id = ct.capture_id
          WHERE c.vault_id = ${session.vault_id} AND ct.kind = 'topic'
          ORDER BY value
          LIMIT 8
        `;
        return { user, recent, counts, recentTopics };
      });

      const promptText = await generatePromptOfDay({
        recentTopics: data.recentTopics.map((r) => r.value),
        recentCount: data.counts.captures,
      });

      return Response.json({
        role: "creator",
        greeting: {
          time_of_day: timeOfDay(),
          display_name: data.user.display_name,
        },
        prompt_of_day: { id: "gemma", text: promptText },
        recent_captures: data.recent,
        stats: data.counts,
      });
    }

    // Nominee — needs to surface released captures + framing from creator
    const data = await withRls(session.user_id, session.role, async (tx) => {
      const releases = await tx<
        {
          id: string;
          kind: "audio" | "photo" | "note" | "video";
          title: string | null;
          body: string | null;
          duration_ms: number | null;
          captured_at: Date;
          released_at: Date;
          transcript_snippet: string | null;
        }[]
      >`
        SELECT c.id, c.kind, c.title, c.body, c.duration_ms, c.captured_at,
               nr.released_at,
               LEFT(COALESCE(c.body, t.text, ''), 240) AS transcript_snippet
        FROM captures c
        JOIN nominee_releases nr ON nr.capture_id = c.id
        JOIN nominees n ON n.id = nr.nominee_id
        LEFT JOIN transcripts t ON t.capture_id = c.id
        WHERE n.user_id = ${session.user_id}
          AND nr.released_at IS NOT NULL
          AND nr.released_at <= now()
        ORDER BY c.captured_at DESC
        LIMIT 50
      `;
      return { releases };
    });

    // Creator + nominee framing — read via admin since the nominee can't
    // see the creator's user row through RLS.
    if (!sqlAdmin) throw new Error("admin_db_unavailable");
    const [framing] = await sqlAdmin<
      { creator_name: string; nominee_name: string; letter_body: string | null }[]
    >`
      SELECT u_creator.display_name AS creator_name,
             u_nominee.display_name AS nominee_name,
             n.letter_body
      FROM nominees n
      JOIN vaults v ON v.id = n.vault_id
      JOIN users u_creator ON u_creator.id = v.creator_id
      JOIN users u_nominee ON u_nominee.id = n.user_id
      WHERE n.user_id = ${session.user_id}
        AND n.vault_id = ${session.vault_id}
      LIMIT 1
    `;

    return Response.json({
      role: "nominee",
      framing: {
        from_name: framing?.creator_name ?? "the creator",
        to_name: framing?.nominee_name ?? "",
        letter_body: framing?.letter_body ?? null,
      },
      released_captures: data.releases,
      stats: { captures: data.releases.length },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

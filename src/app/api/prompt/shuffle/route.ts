import { withRls } from "@/lib/db";
import { errorResponse, requireSession } from "@/lib/auth";
import { generatePromptOfDay } from "@/lib/prompts";

export const dynamic = "force-dynamic";

/**
 * GET /api/prompt/shuffle
 *
 * Returns a freshly-generated reflective prompt. Used by the home's
 * "shuffle" affordance so the creator can rotate suggestions on demand.
 */
export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "creator") {
      return Response.json({ text: "" }, { status: 200 });
    }

    const recentTopics = await withRls(
      session.user_id,
      session.role,
      (tx) => tx<{ value: string }[]>`
        SELECT DISTINCT value FROM capture_tags ct
        JOIN captures c ON c.id = ct.capture_id
        WHERE c.vault_id = ${session.vault_id} AND ct.kind = 'topic'
        ORDER BY value LIMIT 8
      `,
    );
    const recentCount = await withRls(
      session.user_id,
      session.role,
      (tx) => tx<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM captures WHERE vault_id = ${session.vault_id}
      `.then((rows) => rows[0]?.n ?? 0),
    );

    const text = await generatePromptOfDay({
      recentTopics: recentTopics.map((r) => r.value),
      recentCount,
    });
    return Response.json({ text });
  } catch (err) {
    return errorResponse(err);
  }
}

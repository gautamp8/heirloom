import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { withRls } from "@/lib/db";
import { generateSeedLetterPrompts } from "@/lib/prompts";

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/seed-prompts
 *
 * Generates 5-7 sealed-letter occasion prompts via Gemma, tailored to
 * the nominees the creator just added. Does NOT save anything — the
 * client renders these as cards and lets the creator pick which to draft.
 */
export async function POST() {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");

    const data = await withRls(session.user_id, session.role, async (tx) => {
      const creator = await tx<{ display_name: string }[]>`
        SELECT display_name FROM users WHERE id = ${session.user_id}
      `;
      const nominees = await tx<{ name: string; relation: string | null }[]>`
        SELECT name, relationship AS relation FROM nominees
         WHERE vault_id = ${session.vault_id}
         ORDER BY created_at ASC LIMIT 4
      `;
      return { creator: creator[0]?.display_name ?? "the creator", nominees };
    });

    const drafts = await generateSeedLetterPrompts({
      nominees: data.nominees,
      creatorName: data.creator,
    });

    return Response.json({ drafts });
  } catch (err) {
    return errorResponse(err);
  }
}

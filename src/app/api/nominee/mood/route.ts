import { withRls } from "@/lib/db";
import { embedOne, vectorLiteral } from "@/lib/embed";
import { fireLetterConditions } from "@/lib/letter-conditions";
import { errorResponse, HttpError, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/nominee/mood
 *
 * Body: { state: string }
 *
 * Records the mood/state the nominee tapped (or typed) and fires any
 * sealed_letters whose `state` or `semantic_match` conditions match. The
 * state is also persisted to nominee_states for audit + future analytics.
 *
 * Returns: { fired: FiredLetter[] }
 */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "nominee") throw new HttpError(403, "nominee_only");
    const body = (await req.json()) as { state?: string };
    const state = (body.state ?? "").trim();
    if (!state) throw new HttpError(400, "missing_state");

    const embedding = await embedOne(state);

    // Audit log — nominee_states is RLS-gated by nominee_states_self
    await withRls(session.user_id, session.role, async (tx) => {
      const [n] = await tx<{ id: string }[]>`
        SELECT id FROM nominees
         WHERE user_id = ${session.user_id} AND vault_id = ${session.vault_id}
         LIMIT 1
      `;
      if (!n) return;
      await tx`
        INSERT INTO nominee_states (nominee_id, vault_id, state_label, state_embedding)
        VALUES (${n.id}, ${session.vault_id}, ${state},
                ${vectorLiteral(embedding)}::vector)
      `;
    });

    const fired = await fireLetterConditions(session, {
      trigger_kind: "state",
      state,
      embedding,
    });

    return Response.json({ fired });
  } catch (err) {
    return errorResponse(err);
  }
}

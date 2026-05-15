import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { withRls, vec } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/nominees/[id]/photo
 *
 * Body: { face_embedding: number[128] }
 *
 * Stores a reference embedding on the nominee's mirrored `people` row
 * (the one created at saveNominees). Face recognition can then match
 * the nominee in future captures so captions name them by name.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");
    const { id } = await ctx.params;

    const body = (await req.json()) as { face_embedding?: number[] };
    if (
      !Array.isArray(body.face_embedding) ||
      body.face_embedding.length !== 128
    ) {
      throw new HttpError(400, "bad_embedding");
    }

    const faceVec = vec(body.face_embedding);

    const updated = await withRls(session.user_id, session.role, async (tx) => {
      const [n] = await tx<{ id: string }[]>`
        SELECT id FROM nominees
         WHERE id = ${id} AND vault_id = ${session.vault_id}
         LIMIT 1
      `;
      if (!n) return null;

      const [existing] = await tx<{ id: string }[]>`
        SELECT id FROM people
         WHERE nominee_id = ${id} AND vault_id = ${session.vault_id}
         LIMIT 1
      `;
      if (existing) {
        await tx`
          UPDATE people
             SET reference_embedding = ${faceVec},
                 confirmed = TRUE
           WHERE id = ${existing.id}
        `;
        return existing.id;
      }
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO people
          (vault_id, display_name, relation, nominee_id,
           reference_embedding, confirmed)
        SELECT vault_id, name, COALESCE(relationship, 'nominee'),
               id, ${faceVec}, TRUE
          FROM nominees WHERE id = ${id}
        RETURNING id
      `;
      return row.id;
    });

    if (!updated) throw new HttpError(404, "nominee_not_found");
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

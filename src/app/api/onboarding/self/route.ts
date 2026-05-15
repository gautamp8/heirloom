import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { saveSelf } from "@/lib/onboarding";
import { withRls } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST /api/onboarding/self — set the creator's display_name
 *  and/or the reference face_embedding for self-recognition. */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "creator") {
      throw new HttpError(403, "creator_only");
    }
    const body = (await req.json()) as {
      display_name?: string;
      face_embedding?: number[] | null;
    };

    const name = body.display_name?.trim();
    const hasEmbedding =
      Array.isArray(body.face_embedding) && body.face_embedding.length === 128;
    if (!name && !hasEmbedding) {
      throw new HttpError(400, "nothing_to_save");
    }

    await saveSelf(session, {
      display_name: name,
      face_embedding: hasEmbedding ? body.face_embedding! : undefined,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** GET /api/onboarding/self — used by Settings to know whether a
 *  reference selfie is already on file. */
export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "creator") {
      throw new HttpError(403, "creator_only");
    }
    const row = await withRls(session.user_id, session.role, async (tx) => {
      const [r] = await tx<{ has_embedding: boolean }[]>`
        SELECT (reference_embedding IS NOT NULL) AS has_embedding
          FROM people
         WHERE vault_id = ${session.vault_id} AND relation = 'self'
         LIMIT 1
      `;
      return r;
    });
    return Response.json({ has_embedding: !!row?.has_embedding });
  } catch (err) {
    return errorResponse(err);
  }
}

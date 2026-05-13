import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { saveSelf } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

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
    if (!body.display_name?.trim()) throw new HttpError(400, "missing_name");
    await saveSelf(session, {
      display_name: body.display_name,
      face_embedding: Array.isArray(body.face_embedding)
        ? body.face_embedding
        : undefined,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

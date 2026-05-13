import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { updateDisplayName } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");
    const body = (await req.json()) as { display_name?: string };
    if (!body.display_name?.trim()) throw new HttpError(400, "missing_name");
    await updateDisplayName(session, body.display_name);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

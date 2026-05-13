import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { deleteLifeEvent } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");
    const { id } = await ctx.params;
    const ok = await deleteLifeEvent(session, id);
    if (!ok) throw new HttpError(404, "not_found");
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

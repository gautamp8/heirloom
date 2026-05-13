import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { regenerateNomineePassphrase } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");
    const { id } = await ctx.params;
    const r = await regenerateNomineePassphrase(session, id);
    if (!r) throw new HttpError(404, "nominee_not_found");
    return Response.json(r);
  } catch (err) {
    return errorResponse(err);
  }
}

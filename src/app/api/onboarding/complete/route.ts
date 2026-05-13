import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { markOnboarded } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");
    await markOnboarded(session);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

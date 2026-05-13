import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { getSettings } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");
    const data = await getSettings(session);
    return Response.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

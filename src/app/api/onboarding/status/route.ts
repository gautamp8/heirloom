import { errorResponse, requireSession } from "@/lib/auth";
import { getOnboardingStatus } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "creator") {
      return Response.json({ onboarded: true }, { status: 200 });
    }
    const status = await getOnboardingStatus(session);
    return Response.json(status);
  } catch (err) {
    return errorResponse(err);
  }
}

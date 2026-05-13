import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { saveLifeEvents } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");
    const body = (await req.json()) as {
      events?: {
        kind: string;
        label: string;
        event_date?: string | null;
        recurrence?: "yearly" | "once" | null;
        description?: string | null;
      }[];
    };
    const events = Array.isArray(body.events) ? body.events : [];
    const n = await saveLifeEvents(session, events);
    return Response.json({ saved: n });
  } catch (err) {
    return errorResponse(err);
  }
}

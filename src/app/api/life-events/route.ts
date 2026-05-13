import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { saveLifeEvents } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");
    const body = (await req.json()) as {
      kind?: string;
      label?: string;
      event_date?: string | null;
      recurrence?: "yearly" | "once" | null;
      description?: string | null;
    };
    if (!body.label?.trim()) throw new HttpError(400, "missing_label");
    const n = await saveLifeEvents(session, [
      {
        kind: body.kind ?? "milestone",
        label: body.label.trim(),
        event_date: body.event_date ?? null,
        recurrence: body.recurrence ?? null,
        description: body.description ?? null,
      },
    ]);
    return Response.json({ saved: n });
  } catch (err) {
    return errorResponse(err);
  }
}

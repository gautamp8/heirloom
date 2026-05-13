import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { deleteSubscription } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = (await req.json()) as { endpoint?: string };
    if (!body.endpoint) throw new HttpError(400, "missing_endpoint");
    await deleteSubscription(session, body.endpoint);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

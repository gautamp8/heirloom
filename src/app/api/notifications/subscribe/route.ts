import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { saveSubscription } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = (await req.json()) as {
      subscription?: PushSubscriptionJSON;
    };
    const sub = body.subscription;
    if (
      !sub ||
      !sub.endpoint ||
      !sub.keys ||
      typeof sub.keys.p256dh !== "string" ||
      typeof sub.keys.auth !== "string"
    ) {
      throw new HttpError(400, "invalid_subscription");
    }
    const ua = req.headers.get("user-agent");
    const out = await saveSubscription(
      session,
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      },
      ua,
    );
    return Response.json({ ok: true, id: out.id });
  } catch (err) {
    return errorResponse(err);
  }
}

import { errorResponse, requireSession } from "@/lib/auth";
import { sendToUser } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Fire a one-off notification to every subscription on the calling user.
 *  Useful for the Settings "Send a test" affordance. */
export async function POST() {
  try {
    const session = await requireSession();
    const result = await sendToUser(session.user_id, "letter", {
      title: "Heirloom",
      body: "Notifications are working. You're all set.",
      url: "/",
      tag: "heirloom-test",
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}

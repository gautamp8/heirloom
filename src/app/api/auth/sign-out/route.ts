import { clearSessionCookie, errorResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/sign-out - drop the session cookie. Public; the only
 *  effect is to log the caller out of their own browser. */
export async function POST() {
  try {
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** GET /api/auth/sign-out - same as POST but returns a 303 to /portal,
 *  so a user can clear the session by typing the URL into the address
 *  bar on a device where there's no visible sign-out affordance (e.g.
 *  a nominee home on someone else's phone). The Location is relative
 *  so the browser resolves it against whatever host the user opened
 *  (ngrok tunnel, LAN IP, localhost, etc.). */
export async function GET() {
  try {
    await clearSessionCookie();
    return new Response(null, {
      status: 303,
      headers: { Location: "/portal" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

import { clearSessionCookie, errorResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Drop the session cookie. */
export async function POST() {
  try {
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** GET variant that 303-redirects to /portal, for URL-bar sign-outs
 *  on surfaces with no visible affordance. Relative Location resolves
 *  against the caller's host. */
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

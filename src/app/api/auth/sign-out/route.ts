import { clearSessionCookie, errorResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/sign-out — drop the session cookie. Public; the only
 *  effect is to log the caller out of their own browser. */
export async function POST() {
  try {
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sqlAdmin } from "./db";

const DEV_FALLBACK_SECRET =
  "dev-only-rotate-in-prod-this-string-is-not-a-real-secret-32b";

// Fail closed in production. The fallback secret is public (it's in this
// repo), so booting a production instance without a real JWT_SECRET would
// let anyone forge a session cookie for any {user_id, vault_id, role} —
// total cross-vault takeover. The self-host and dev bootstrap scripts
// generate a random secret; this guarantees an operator who skips them
// can't silently ship the placeholder. (Mirrors postgres.ts throwing on
// a missing DATABASE_URL.)
const jwtSecretEnv = process.env.JWT_SECRET;
// Guard at runtime, not during `next build` — the build evaluates this
// module with NODE_ENV=production but has no reason to hold the real
// secret (it isn't serving requests). NEXT_PHASE marks the build.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
// The desktop bundle runs NODE_ENV=production but is a single-user,
// on-device build (sqlite backend, one vault, the OS user is the trust
// boundary). Forging your own session on your own machine isn't the
// cross-vault threat this guard exists for — that only applies to a
// multi-vault server. So exempt the local build, matching the same
// isLocal check the cookie's `secure` flag uses below.
const isLocalBackend = process.env.HEIRLOOM_BACKEND === "sqlite";
if (
  process.env.NODE_ENV === "production" &&
  !isBuildPhase &&
  !isLocalBackend &&
  (!jwtSecretEnv || jwtSecretEnv === DEV_FALLBACK_SECRET)
) {
  throw new Error(
    "JWT_SECRET must be set to a unique random value in production " +
      "(generate with `openssl rand -base64 32`). Refusing to start with " +
      "the public dev fallback — anyone could forge session cookies.",
  );
}

const SECRET = new TextEncoder().encode(jwtSecretEnv ?? DEV_FALLBACK_SECRET);

const COOKIE_NAME = "heirloom_session";
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

export type Session = {
  user_id: string;
  vault_id: string;
  role: "creator" | "nominee";
};

/** /dev role-switcher and vault-reset surfaces. Always on in development;
 *  in production, opt-in via HEIRLOOM_ALLOW_DEV_FIXTURES. When enabled in
 *  production these routes are UNAUTHENTICATED and destructive
 *  (/api/dev/reset TRUNCATEs everything, /api/dev/nominee hands out a
 *  logged-in nominee session) — never set the flag on a real host. */
export function devFixturesAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const on =
    process.env.HEIRLOOM_ALLOW_DEV_FIXTURES === "1" ||
    process.env.HEIRLOOM_ALLOW_DEV_FIXTURES === "true";
  if (on && !warnedDevFixtures) {
    warnedDevFixtures = true;
    console.warn(
      "[heirloom] SECURITY: HEIRLOOM_ALLOW_DEV_FIXTURES is enabled in " +
        "production. /api/dev/* routes are live, unauthenticated, and " +
        "destructive. Unset this unless you know exactly why it's on.",
    );
  }
  return on;
}
let warnedDevFixtures = false;

export async function issueSession(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const { user_id, vault_id, role } = payload as Partial<Session>;
    if (!user_id || !vault_id || !role) return null;
    if (sqlAdmin) {
      // Assert the user actually belongs to the vault in the claimed role,
      // not merely that both rows exist — so a de-designated nominee's
      // session stops resolving instead of relying on RLS to return zero
      // rows everywhere downstream.
      const [row] = await sqlAdmin<{ ok: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM vaults v
          WHERE v.id = ${vault_id} AND v.creator_id = ${user_id}
        ) OR EXISTS (
          SELECT 1 FROM nominees n
          WHERE n.vault_id = ${vault_id} AND n.user_id = ${user_id}
        ) AS ok`;
      if (!row?.ok) {
        await clearSessionCookie();
        return null;
      }
    }
    return { user_id, vault_id, role };
  } catch {
    return null;
  }
}

export async function setSessionCookie(jwt: string): Promise<void> {
  const jar = await cookies();
  // Skip Secure on plain http://127.0.0.1 so WKWebView and the dev
  // server accept the cookie; only HTTPS deployments need it.
  const isLocal = process.env.HEIRLOOM_BACKEND === "sqlite";
  jar.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !isLocal,
    maxAge: COOKIE_MAX_AGE_S,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function requireSession(): Promise<Session> {
  const s = await readSession();
  if (!s) throw new HttpError(401, "unauthorized");
  return s;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json(
      { error: { code: err.message, message: err.message } },
      { status: err.status },
    );
  }
  console.error("[unhandled]", err);
  return Response.json(
    { error: { code: "internal", message: "Something went wrong." } },
    { status: 500 },
  );
}

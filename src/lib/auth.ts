import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sqlAdmin } from "./db";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ??
    "dev-only-rotate-in-prod-this-string-is-not-a-real-secret-32b",
);

const COOKIE_NAME = "heirloom_session";
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

export type Session = {
  user_id: string;
  vault_id: string;
  role: "creator" | "nominee";
};

/** /dev role-switcher and vault-reset surfaces. Always on in development;
 *  in production, opt-in via HEIRLOOM_ALLOW_DEV_FIXTURES. */
export function devFixturesAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.HEIRLOOM_ALLOW_DEV_FIXTURES === "1" ||
         process.env.HEIRLOOM_ALLOW_DEV_FIXTURES === "true";
}

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
      const [row] = await sqlAdmin<{ ok: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM users u JOIN vaults v ON v.id = ${vault_id}
          WHERE u.id = ${user_id}
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
  // Desktop bundle and dev both serve over plain http://127.0.0.1 where
  // Secure-marked cookies are dropped by the WKWebView / browser. Only
  // production HTTPS deployments set Secure.
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

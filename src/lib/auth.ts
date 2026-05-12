import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

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
    return { user_id, vault_id, role };
  } catch {
    return null;
  }
}

export async function setSessionCookie(jwt: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_S,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/** Read the session and throw if none — for use inside route handlers that
 *  must be authenticated. */
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

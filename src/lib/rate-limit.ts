import { sqlAdmin } from "@/lib/db";

/**
 * Fixed-window per-key rate limiting, backed by the `rate_limits` table
 * (migration 010) so it works across Vercel's stateless functions — an
 * in-process counter is empty on every cold start and never shared
 * between concurrent instances, which is why the demo needed a real
 * store.
 *
 * The window is folded into the key, so each window is its own row and
 * the count resets simply by moving to a new bucket. Old rows are swept
 * by the nightly reset cron.
 *
 * Fails OPEN: if there is no admin connection (local/desktop, which is
 * single-user and un-throttled by design) or the store errors, the
 * request is allowed. This is a demo cost guard, not an auth control —
 * it must never take the app down.
 */
export async function rateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<{ ok: boolean; remaining: number; retryAfter: number }> {
  if (!sqlAdmin) return { ok: true, remaining: limit, retryAfter: 0 };

  const nowSec = Math.floor(Date.now() / 1000);
  const windowIndex = Math.floor(nowSec / windowSeconds);
  const key = `${scope}:${identifier}:${windowIndex}`;
  const retryAfter = (windowIndex + 1) * windowSeconds - nowSec;

  try {
    const [row] = await sqlAdmin<{ count: number }[]>`
      INSERT INTO rate_limits (key, count)
      VALUES (${key}, 1)
      ON CONFLICT (key)
        DO UPDATE SET count = rate_limits.count + 1
      RETURNING count
    `;
    const count = row?.count ?? 1;
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfter,
    };
  } catch {
    // Never let the limiter itself break a request.
    return { ok: true, remaining: limit, retryAfter: 0 };
  }
}

/**
 * Best-effort client IP for keying. Vercel sets x-forwarded-for; the
 * left-most entry is the original client. Falls back to a constant so a
 * missing header buckets everyone together (still a global ceiling)
 * rather than throwing.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

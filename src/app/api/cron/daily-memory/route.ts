import { sqlAdmin } from "@/lib/db";
import { errorResponse, HttpError } from "@/lib/auth";
import { sendToUser, type PushPayload } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/daily-memory
 *
 * Picks one released capture per nominee and sends a "today's memory"
 * push notification. Intended to be hit by a systemd timer or external
 * cron once a day.
 *
 * Auth: shared secret in `X-Cron-Secret` header. Set CRON_SECRET in the
 * environment; if it's unset, the route is open in development only.
 */
export async function POST(req: Request) {
  try {
    if (!sqlAdmin) throw new HttpError(500, "admin_db_unavailable");
    const expected = process.env.CRON_SECRET;
    if (expected) {
      const got = req.headers.get("x-cron-secret");
      if (got !== expected) throw new HttpError(401, "unauthorized");
    } else if (process.env.NODE_ENV === "production") {
      throw new HttpError(500, "cron_secret_unset");
    }

    const rows = await sqlAdmin<
      { nominee_user_id: string; capture_id: string; title: string | null }[]
    >`
      WITH ranked AS (
        SELECT n.user_id AS nominee_user_id,
               c.id AS capture_id,
               c.title,
               row_number() OVER (
                 PARTITION BY n.user_id
                 ORDER BY random()
               ) AS rn
          FROM nominee_releases nr
          JOIN nominees n ON n.id = nr.nominee_id
          JOIN captures c ON c.id = nr.capture_id
         WHERE n.user_id IS NOT NULL
           AND nr.released_at <= now()
           AND c.status = 'ready'
      )
      SELECT nominee_user_id, capture_id, title
        FROM ranked WHERE rn = 1
    `;

    let delivered = 0;
    for (const r of rows) {
      const payload: PushPayload = {
        title: "A memory for today",
        body: r.title ?? "Open Heirloom to listen.",
        url: "/",
        tag: `daily-${r.capture_id.slice(0, 8)}`,
      };
      const out = await sendToUser(r.nominee_user_id, "daily", payload);
      delivered += out.delivered;
    }
    return Response.json({ ok: true, eligible: rows.length, delivered });
  } catch (err) {
    return errorResponse(err);
  }
}

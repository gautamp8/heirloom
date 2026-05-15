import { sqlAdmin } from "@/lib/db";
import { devFixturesAllowed, errorResponse, HttpError } from "@/lib/auth";
import { sendToUser, type PushPayload } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * POST /api/dev/send-memory
 *
 * Body (all optional):
 *   { nominee_email?: string, nominee_name?: string,
 *     capture_id?: string, title?: string, body?: string }
 *
 * Dev/demo trigger that picks one released capture for the nominee and
 * fires the same "today's memory" push the daily-memory cron sends. Use
 * to cue the notification on camera.
 */
export async function POST(req: Request) {
  try {
    if (!devFixturesAllowed()) throw new HttpError(404, "not_found");
    if (!sqlAdmin) throw new HttpError(500, "admin_db_unavailable");

    const body = (await req.json().catch(() => ({}))) as {
      nominee_email?: string;
      nominee_name?: string;
      user_email?: string;
      capture_id?: string;
      title?: string;
      body?: string;
    };

    let target_user_id: string | null = null;
    if (body.user_email) {
      // Target any user by email (works for creator OR nominee).
      const [u] = await sqlAdmin<{ id: string }[]>`
        SELECT id FROM users WHERE lower(email) = lower(${body.user_email}) LIMIT 1
      `;
      target_user_id = u?.id ?? null;
    } else if (body.nominee_email) {
      const [u] = await sqlAdmin<{ id: string }[]>`
        SELECT id FROM users WHERE lower(email) = lower(${body.nominee_email}) LIMIT 1
      `;
      target_user_id = u?.id ?? null;
    } else if (body.nominee_name) {
      const [n] = await sqlAdmin<{ user_id: string | null }[]>`
        SELECT user_id FROM nominees
        WHERE lower(name) = lower(${body.nominee_name})
          AND user_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      `;
      target_user_id = n?.user_id ?? null;
    } else {
      const [n] = await sqlAdmin<{ user_id: string | null }[]>`
        SELECT user_id FROM nominees
        WHERE user_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      `;
      target_user_id = n?.user_id ?? null;
    }
    if (!target_user_id) throw new HttpError(404, "user_not_found");

    let capture_id: string | null = body.capture_id ?? null;
    let title: string | null = body.title ?? null;
    if (!capture_id) {
      const [r] = await sqlAdmin<{ capture_id: string; title: string | null }[]>`
        SELECT c.id AS capture_id, c.title
          FROM nominee_releases nr
          JOIN nominees n ON n.id = nr.nominee_id
          JOIN captures c ON c.id = nr.capture_id
         WHERE n.user_id = ${target_user_id}
           AND nr.released_at <= now()
           AND c.status = 'ready'
           AND c.is_profile = false
         ORDER BY c.captured_at DESC
         LIMIT 1
      `;
      if (r) {
        capture_id = r.capture_id;
        title = title ?? r.title;
      }
      // Fall through with no capture - the endpoint still fires a push
      // so we can verify the push pipeline before captures exist.
    }

    const payload: PushPayload = {
      title: body.title ?? "A memory for today",
      body: body.body ?? title ?? "Open Heirloom to listen.",
      url: "/",
      tag: capture_id ? `dev-${capture_id.slice(0, 8)}` : "dev-test",
    };
    const out = await sendToUser(target_user_id, "daily", payload);
    return Response.json({
      ok: true,
      target_user_id,
      capture_id,
      ...out,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

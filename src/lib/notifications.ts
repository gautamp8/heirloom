import webpush from "web-push";
import { sqlAdmin, withRls } from "./db";
import type { Session } from "./auth";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subj) return false;
  webpush.setVapidDetails(subj, pub, priv);
  configured = true;
  return true;
}

export type StoredSubscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  enabled_daily: boolean;
  enabled_letters: boolean;
};

export type PushChannel = "letter" | "daily";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function saveSubscription(
  session: Session,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  user_agent?: string | null,
): Promise<{ id: string }> {
  return withRls(session.user_id, session.role, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO push_subscriptions
        (user_id, endpoint, p256dh, auth, user_agent)
      VALUES
        (${session.user_id}, ${sub.endpoint}, ${sub.keys.p256dh},
         ${sub.keys.auth}, ${user_agent ?? null})
      ON CONFLICT (user_id, endpoint) DO UPDATE
        SET p256dh = EXCLUDED.p256dh,
            auth   = EXCLUDED.auth,
            last_used_at = now()
      RETURNING id
    `;
    return row;
  });
}

export async function deleteSubscription(
  session: Session,
  endpoint: string,
): Promise<void> {
  await withRls(session.user_id, session.role, async (tx) => {
    await tx`
      DELETE FROM push_subscriptions
       WHERE user_id = ${session.user_id} AND endpoint = ${endpoint}
    `;
  });
}

export async function sendToUser(
  user_id: string,
  channel: PushChannel,
  payload: PushPayload,
): Promise<{ delivered: number; pruned: number }> {
  if (!ensureConfigured()) return { delivered: 0, pruned: 0 };
  if (!sqlAdmin) return { delivered: 0, pruned: 0 };

  const channelFilter =
    channel === "letter" ? sqlAdmin`AND enabled_letters` : sqlAdmin`AND enabled_daily`;

  const subs = await sqlAdmin<StoredSubscription[]>`
    SELECT id, user_id, endpoint, p256dh, auth, enabled_daily, enabled_letters
      FROM push_subscriptions
     WHERE user_id = ${user_id} ${channelFilter}
  `;

  let delivered = 0;
  let pruned = 0;
  const body = JSON.stringify(payload);
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      );
      delivered += 1;
      await sqlAdmin`
        UPDATE push_subscriptions SET last_used_at = now() WHERE id = ${s.id}
      `;
    } catch (e: unknown) {
      const status =
        e && typeof e === "object" && "statusCode" in e
          ? Number((e as { statusCode: unknown }).statusCode)
          : 0;
      if (status === 404 || status === 410) {
        await sqlAdmin`DELETE FROM push_subscriptions WHERE id = ${s.id}`;
        pruned += 1;
      } else {
        console.warn("[push] send failed", status, e);
      }
    }
  }
  return { delivered, pruned };
}

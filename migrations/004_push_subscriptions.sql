-- Web Push subscriptions for iOS PWA notifications.
--
-- One row per (user, browser/device). The endpoint + keys come from
-- ServiceWorkerRegistration.pushManager.subscribe() on the client and
-- are passed to `web-push` server-side to actually deliver a push.

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint        text NOT NULL,
    p256dh          text NOT NULL,
    auth            text NOT NULL,
    user_agent      text,
    enabled_daily   boolean NOT NULL DEFAULT TRUE,
    enabled_letters boolean NOT NULL DEFAULT TRUE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_used_at    timestamptz,

    UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
    ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owners read + write their own subscriptions.
DROP POLICY IF EXISTS push_subscriptions_owner_all ON push_subscriptions;
CREATE POLICY push_subscriptions_owner_all
    ON push_subscriptions
    FOR ALL
    USING (user_id = current_setting('app.user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

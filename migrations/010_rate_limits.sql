-- 010_rate_limits.sql
--
-- Fixed-window rate-limit counters, for the public hosted demo only.
--
-- The demo accepts anonymous submissions and its Reflect endpoint calls
-- a paid Azure model on every request, so an unthrottled public URL is a
-- direct cost/abuse vector. The only limiter that previously existed
-- (executor unlock) kept its counters in an in-process Map, which does
-- nothing on Vercel's stateless functions — each invocation may be a
-- fresh instance, so the Map is empty every time.
--
-- This table is the shared store instead. Each row is one (endpoint, ip,
-- window) bucket; the window is encoded in the key, so a new window is a
-- new row and the count resets for free. Old rows are swept by the
-- nightly reset cron. Written only through the admin connection (this is
-- infrastructure, not per-vault data), so no RLS policy applies.
CREATE TABLE IF NOT EXISTS rate_limits (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limits_created_at_idx
  ON rate_limits (created_at);

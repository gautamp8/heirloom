#!/usr/bin/env bash
# One-shot Neon setup for the Vercel hosted demo.
#
#   ADMIN_URL='postgres://neondb_owner:...@ep-xxx.REGION.aws.neon.tech/neondb?sslmode=require' \
#   APP_PW='<pick-a-strong-password>' \
#   bash infra/neon-setup.sh
#
# ADMIN_URL must be the Neon OWNER role on the DIRECT (unpooled) endpoint —
# it creates the non-owner heirloom_app role (so RLS is actually enforced;
# the owner bypasses it), then applies the baseline schema + numbered
# migrations as the owner. Idempotent-ish: re-running errors on the
# non-idempotent baseline CREATE TYPE/TABLE, so run it once on a fresh DB.
#
# Afterwards, DATABASE_URL for the app is the heirloom_app role on the
# POOLED (-pooler) endpoint; DATABASE_ADMIN_URL is this owner URL.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${ADMIN_URL:?ADMIN_URL (neondb_owner, direct endpoint) not set}"
: "${APP_PW:?APP_PW (password for the heirloom_app role) not set}"

echo "[neon-setup] creating the non-owner heirloom_app role"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 \
  -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='heirloom_app') THEN CREATE ROLE heirloom_app LOGIN PASSWORD '${APP_PW}'; END IF; END \$\$;" \
  -c "ALTER ROLE heirloom_app PASSWORD '${APP_PW}';" \
  -c "GRANT USAGE, CREATE ON SCHEMA public TO heirloom_app;" \
  -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO heirloom_app;" \
  -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO heirloom_app;"

echo "[neon-setup] applying baseline schema"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f design-system/handoff/SCHEMA.sql

echo "[neon-setup] applying migrations 00*.sql in order"
for f in migrations/0*.sql; do
  echo "  -> $f"
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "[neon-setup] backstop grants on everything just created"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 \
  -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO heirloom_app;" \
  -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO heirloom_app;"

echo "[neon-setup] verifying"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) AS tables FROM information_schema.tables WHERE table_schema='public';" \
  -c "SELECT extname FROM pg_extension WHERE extname IN ('vector','uuid-ossp','pgcrypto','citext') ORDER BY extname;"

echo "[neon-setup] done. App role: heirloom_app (use it on the -pooler endpoint for DATABASE_URL)."

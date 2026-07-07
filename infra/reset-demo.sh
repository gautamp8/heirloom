#!/usr/bin/env bash
# Restore the pristine Sagan archive on the public demo. Run nightly by
# heirloom-reset.timer, and once by hand for the first seed import.
#
# Drops every vault/user/submission and re-imports the seed under the
# hosted-demo provider profile (so embeddings are Azure and match what the
# app queries with). Anything visitors created since the last reset is
# gone — that's the point.
#
# Runs as the heirloom user with /opt/heirloom/.env sourced by systemd.

set -euo pipefail
cd /opt/heirloom/app

: "${DATABASE_ADMIN_URL:?DATABASE_ADMIN_URL not set (source /opt/heirloom/.env)}"

echo "[reset-demo] wiping submissions"
# TRUNCATE the whole app schema in FK-safe order via CASCADE. users/vaults
# cascade to everything else. app_settings is instance config, not vault
# data, so it survives.
psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE users CASCADE;
SQL

echo "[reset-demo] clearing stored blobs"
rm -f /opt/heirloom/app/storage/blobs/* 2>/dev/null || true

echo "[reset-demo] re-importing the Sagan seed (hosted-demo profile)"
pnpm tsx desktop/scripts/import-seed-archive.ts ./desktop/seed-archives/sagan

echo "[reset-demo] done"

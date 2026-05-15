#!/usr/bin/env bash
# Runs ON the VM after the source has been rsync'd into /opt/heirloom/app.
# Builds the production bundle, applies migrations, starts the systemd unit.

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0" >&2
  exit 1
fi

heading() { printf "\n\033[1;35m=== %s ===\033[0m\n" "$1"; }
ok()      { printf "  \033[32mok\033[0m  %s\n" "$1"; }
note()    { printf "  \033[90m..\033[0m  %s\n" "$1"; }

# 1. Fix ownership of the rsync'd source --------------------------------
heading "Ownership"
chown -R heirloom:heirloom /opt/heirloom/app
ok "/opt/heirloom/app owned by heirloom"

# 2. pnpm install + build -----------------------------------------------
# We deliberately don't use --frozen-lockfile so a lockfile checked in
# from a different pnpm version (eg the developer's mac on pnpm 8, vm
# on pnpm 10) doesn't block the build. Production safety still comes
# from the package.json semver pins.
#
# Next.js evaluates every route handler at build time (page-data
# collection), so lib/db.ts gets imported and throws if DATABASE_URL
# isn't set. We source /opt/heirloom/.env into the build environment.
heading "Build"
cd /opt/heirloom/app
sudo -u heirloom pnpm install --prefer-offline
sudo -u heirloom --preserve-env=PATH bash -c \
    'set -a; source /opt/heirloom/.env; set +a; pnpm build'
ok "production build ready"

# 3. Database migrations -------------------------------------------------
# /opt/heirloom is owned by the heirloom user with restrictive perms,
# so we pipe the SQL through stdin rather than letting the postgres
# user try to open the file directly.
heading "Migrations"
if ! sudo -u postgres psql -d heirloom -tAc "SELECT 1 FROM pg_tables WHERE tablename='captures'" | grep -q 1; then
  note "Applying base SCHEMA.sql"
  cat /opt/heirloom/app/design-system/handoff/SCHEMA.sql | sudo -u postgres psql -d heirloom >/dev/null
  ok "base schema applied"
fi
for mig in /opt/heirloom/app/migrations/*.sql; do
  [[ -e "$mig" ]] || continue
  note "Applying $(basename "$mig")"
  cat "$mig" | sudo -u postgres psql -d heirloom -v ON_ERROR_STOP=0 >/dev/null 2>&1 || true
done
ok "migrations done"

# 4. heirloom/gemma4-grounded variant ------------------------------------
if [[ -f /opt/heirloom/app/Modelfile ]]; then
  heading "Building heirloom/gemma4-grounded"
  cd /opt/heirloom/app
  sudo -u ollama ollama create heirloom/gemma4-grounded -f Modelfile >/dev/null
  ok "heirloom/gemma4-grounded available"
fi

# 5. Start the Heirloom systemd unit ------------------------------------
heading "Starting heirloom.service"
systemctl restart heirloom
sleep 5
systemctl --no-pager status heirloom | head -12
ok "Heirloom up - Caddy now serves https traffic"

echo
echo "Reachable at:"
grep -oE '^[a-z0-9.-]+\.cloudapp\.azure\.com' /etc/caddy/Caddyfile | head -1 \
    | xargs -I {} echo "  https://{}"

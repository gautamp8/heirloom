#!/usr/bin/env bash
# Runs ON the VM after the source has been rsync'd into /opt/heirloom/app.
# Builds the production bundle, applies migrations, restarts the systemd
# unit. Idempotent: safe to run on every deploy.

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0" >&2
  exit 1
fi

ENV_FILE="/opt/heirloom/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "$ENV_FILE missing - run infra/vm-setup.sh first." >&2
  exit 1
fi

heading() { printf "\n\033[1;35m=== %s ===\033[0m\n" "$1"; }
ok()      { printf "  \033[32mok\033[0m  %s\n" "$1"; }
note()    { printf "  \033[90m..\033[0m  %s\n" "$1"; }

# 1. Ownership + storage dirs -------------------------------------------
heading "Ownership"
mkdir -p /opt/heirloom/app/storage/blobs
chown -R heirloom:heirloom /opt/heirloom/app
chown -R heirloom:heirloom /opt/heirloom/app/storage
ok "/opt/heirloom/app owned by heirloom"

# 2. pnpm install + build -----------------------------------------------
# Next.js evaluates every route handler at build time (page-data
# collection), so lib/db.ts gets imported and throws if DATABASE_URL
# isn't set. Source /opt/heirloom/.env into the build environment.
heading "Build"
cd /opt/heirloom/app
sudo -u heirloom pnpm install --prefer-offline
sudo -u heirloom --preserve-env=PATH bash -c \
    "set -a; source $ENV_FILE; set +a; pnpm build"
ok "production build ready"

# 3. Database migrations -------------------------------------------------
heading "Migrations"
if ! sudo -u postgres psql -d heirloom -tAc "SELECT 1 FROM pg_tables WHERE tablename='captures'" | grep -q 1; then
  note "Applying base SCHEMA.sql"
  sudo -u postgres psql -d heirloom -v ON_ERROR_STOP=1 \
      -f /opt/heirloom/app/design-system/handoff/SCHEMA.sql >/dev/null
  ok "base schema applied"
fi
for mig in /opt/heirloom/app/migrations/*.sql; do
  [[ -e "$mig" ]] || continue
  note "Applying $(basename "$mig")"
  if ! sudo -u postgres psql -d heirloom -v ON_ERROR_STOP=0 -f "$mig" >/tmp/heirloom-mig.log 2>&1; then
    note "migration emitted warnings (see /tmp/heirloom-mig.log)"
  fi
done
ok "migrations applied"

# 4. heirloom/gemma4-grounded variant ------------------------------------
if [[ -f /opt/heirloom/app/Modelfile ]]; then
  heading "Building heirloom/gemma4-grounded"
  cd /opt/heirloom/app
  sudo -u ollama ollama create heirloom/gemma4-grounded -f Modelfile >/dev/null
  ok "heirloom/gemma4-grounded available"
fi

# 5. Restart the Heirloom systemd unit ----------------------------------
heading "Starting heirloom.service"
systemctl restart heirloom

# Wait for the app to actually respond on localhost:3000 before
# declaring success. systemd "active" only means the process is alive,
# not that Next.js finished initialising.
note "Waiting for the app to bind to :3000"
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/api/health 2>/dev/null \
      || curl -fsS -o /dev/null http://127.0.0.1:3000/portal 2>/dev/null; then
    ok "app responding"
    break
  fi
  sleep 2
done

systemctl --no-pager status heirloom | head -10

PUBLIC_HOST=$(grep -E '^[a-z0-9.-]+\s*\{' /etc/caddy/Caddyfile | head -1 | awk '{print $1}')
echo
echo "Reachable at:"
echo "  https://$PUBLIC_HOST"

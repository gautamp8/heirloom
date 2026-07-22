#!/usr/bin/env bash
# Heirloom PUBLIC DEMO - Ubuntu 22.04 single-VM bootstrap.
#
# The opposite of the shipped product on purpose: this runs the SAME code
# but with the `hosted-demo` provider profile, so inference is Azure
# OpenAI instead of local Ollama. That keeps the VM tiny (e2-small class,
# no 10 GB of model weights, no GPU) so a stranger can try the Sagan
# archive without installing anything. The app you download still runs
# entirely on your own device.
#
# Differences from infra/vm-setup.sh (the self-host bootstrap):
#   - NO Ollama. HEIRLOOM_PROVIDER_PROFILE=hosted-demo + Azure OpenAI env.
#   - whisper-cli stays (cheap CPU) so voice notes still transcribe, but
#     voice CLONING / spoken letters are hidden in the hosted profile.
#   - Demo banner on. Dev fixtures OFF. Rate limiting at the edge.
#   - A nightly timer restores the pristine Sagan archive.
#
# Runs ON the target VM as root. Idempotent.
#
# Required env:
#   PUBLIC_HOST=demo.withheirloom.app
#   AZURE_OPENAI_ENDPOINT=https://<resource>.cognitiveservices.azure.com
#   AZURE_OPENAI_API_KEY=...
#   AZURE_OPENAI_CHAT_DEPLOYMENT=heirloom-chat
#   AZURE_OPENAI_EMBED_DEPLOYMENT=heirloom-embed
# Optional: AZURE_OPENAI_EMBED_MODEL (default text-embedding-3-small),
#           HEIRLOOM_RETRIEVAL_FLOOR, DB_PASS, DB_ADMIN_PASS, JWT_SECRET,
#           VAPID_* (auto-generated + preserved across re-runs).

set -euo pipefail

PUBLIC_HOST="${PUBLIC_HOST:?must provide PUBLIC_HOST=demo.withheirloom.app}"
AZURE_OPENAI_ENDPOINT="${AZURE_OPENAI_ENDPOINT:?must provide AZURE_OPENAI_ENDPOINT}"
AZURE_OPENAI_API_KEY="${AZURE_OPENAI_API_KEY:?must provide AZURE_OPENAI_API_KEY}"
AZURE_OPENAI_CHAT_DEPLOYMENT="${AZURE_OPENAI_CHAT_DEPLOYMENT:?must provide AZURE_OPENAI_CHAT_DEPLOYMENT}"
AZURE_OPENAI_EMBED_DEPLOYMENT="${AZURE_OPENAI_EMBED_DEPLOYMENT:?must provide AZURE_OPENAI_EMBED_DEPLOYMENT}"
AZURE_OPENAI_EMBED_MODEL="${AZURE_OPENAI_EMBED_MODEL:-text-embedding-3-small}"
HEIRLOOM_RETRIEVAL_FLOOR="${HEIRLOOM_RETRIEVAL_FLOOR:-}"

ENV_FILE="/opt/heirloom/.env"

heading() { printf "\n\033[1;35m=== %s ===\033[0m\n" "$1"; }
ok()      { printf "  \033[32mok\033[0m  %s\n" "$1"; }
note()    { printf "  \033[90m..\033[0m  %s\n" "$1"; }

if [[ "${EUID}" -ne 0 ]]; then echo "Run with sudo: sudo bash $0" >&2; exit 1; fi
export DEBIAN_FRONTEND=noninteractive

read_or_generate() {
  local key="$1" generator="$2"
  if [[ -f "$ENV_FILE" ]] && grep -qE "^${key}=" "$ENV_FILE"; then
    grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2-
  else eval "$generator"; fi
}

DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"
DB_ADMIN_PASS="${DB_ADMIN_PASS:-$(openssl rand -hex 16)}"
JWT_SECRET="${JWT_SECRET:-$(read_or_generate JWT_SECRET 'openssl rand -hex 32')}"
if [[ -f "$ENV_FILE" ]]; then
  EX_DB=$(grep -E '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|' || true)
  EX_ADMIN=$(grep -E '^DATABASE_ADMIN_URL=' "$ENV_FILE" 2>/dev/null | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|' || true)
  [[ -n "${EX_DB:-}" ]] && DB_PASS="$EX_DB"
  [[ -n "${EX_ADMIN:-}" ]] && DB_ADMIN_PASS="$EX_ADMIN"
fi

# 1. Base packages (no Ollama, no build-essential for tfjs) ---------------
heading "Base packages"
apt-get update -y
apt-get install -y --no-install-recommends \
    ca-certificates curl git gnupg lsb-release openssl ffmpeg \
    pkg-config libssl-dev apt-transport-https cmake rsync jq
ok "base packages installed"

# 2. Node 22 + pnpm -------------------------------------------------------
heading "Node 22 + pnpm"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y --no-install-recommends nodejs
fi
command -v pnpm >/dev/null 2>&1 || npm install -g pnpm@10
ok "node $(node -v), pnpm $(pnpm -v)"

# 3. PostgreSQL 16 + pgvector --------------------------------------------
heading "PostgreSQL 16 + pgvector"
if ! command -v psql >/dev/null 2>&1; then
  sh -c 'echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt jammy-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg
  apt-get update -y
  apt-get install -y --no-install-recommends postgresql-16 postgresql-server-dev-16 postgresql-16-pgvector
fi
systemctl enable --now postgresql; sleep 2
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
SELECT 'CREATE DATABASE heirloom' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'heirloom')\gexec
SQL
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heirloom_app') THEN
    CREATE ROLE heirloom_app LOGIN PASSWORD '$DB_PASS';
  ELSE ALTER ROLE heirloom_app WITH PASSWORD '$DB_PASS'; END IF;
END \$\$;
ALTER USER postgres WITH PASSWORD '$DB_ADMIN_PASS';
SQL
sudo -u postgres psql -d heirloom <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
GRANT ALL ON SCHEMA public TO heirloom_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO heirloom_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO heirloom_app;
SQL
ok "database 'heirloom' ready"

# 4. whisper-cpp (voice notes still transcribe on the demo) --------------
heading "whisper-cpp"
if ! command -v whisper-cli >/dev/null 2>&1; then
  apt-get install -y --no-install-recommends build-essential
  cd /opt
  [[ -d whisper.cpp ]] || git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git
  cd whisper.cpp
  cmake -B build -DCMAKE_BUILD_TYPE=Release >/dev/null
  cmake --build build --config Release -j"$(nproc)" >/dev/null
  bash models/download-ggml-model.sh small.en
  install -m 0755 build/bin/whisper-cli /usr/local/bin/whisper-cli
fi
ok "whisper-cli ready"

# 5. App user + dir -------------------------------------------------------
heading "App user + directory"
id heirloom >/dev/null 2>&1 || useradd -r -m -d /opt/heirloom -s /bin/bash heirloom
mkdir -p /opt/heirloom/app /opt/heirloom/app/storage/blobs
chown -R heirloom:heirloom /opt/heirloom
ok "user 'heirloom' + /opt/heirloom/app ready"

# 6. VAPID keys -----------------------------------------------------------
heading "Web Push (VAPID) keys"
VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY:-}"; VAPID_PRIVATE_KEY="${VAPID_PRIVATE_KEY:-}"
if [[ -f "$ENV_FILE" ]]; then
  EX_VPUB=$(grep -E '^VAPID_PUBLIC_KEY=' "$ENV_FILE" | cut -d= -f2- || true)
  EX_VPRIV=$(grep -E '^VAPID_PRIVATE_KEY=' "$ENV_FILE" | cut -d= -f2- || true)
  [[ -n "${EX_VPUB:-}" ]] && VAPID_PUBLIC_KEY="$EX_VPUB"
  [[ -n "${EX_VPRIV:-}" ]] && VAPID_PRIVATE_KEY="$EX_VPRIV"
fi
if [[ -z "$VAPID_PUBLIC_KEY" || -z "$VAPID_PRIVATE_KEY" ]]; then
  VAPID_JSON=$(npx -y web-push generate-vapid-keys --json 2>/dev/null)
  VAPID_PUBLIC_KEY=$(echo "$VAPID_JSON" | jq -r .publicKey)
  VAPID_PRIVATE_KEY=$(echo "$VAPID_JSON" | jq -r .privateKey)
fi
CRON_SECRET="${CRON_SECRET:-$(read_or_generate CRON_SECRET 'openssl rand -hex 24')}"
ok "VAPID + cron secret present"

# 7. Environment ----------------------------------------------------------
heading "Environment (hosted-demo profile)"
umask 077
FLOOR_LINE=""
[[ -n "$HEIRLOOM_RETRIEVAL_FLOOR" ]] && FLOOR_LINE="HEIRLOOM_RETRIEVAL_FLOOR=$HEIRLOOM_RETRIEVAL_FLOOR"
cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://heirloom_app:$DB_PASS@127.0.0.1:5432/heirloom
DATABASE_ADMIN_URL=postgres://postgres:$DB_ADMIN_PASS@127.0.0.1:5432/heirloom
HEIRLOOM_PROVIDER_PROFILE=hosted-demo
AZURE_OPENAI_ENDPOINT=$AZURE_OPENAI_ENDPOINT
AZURE_OPENAI_API_KEY=$AZURE_OPENAI_API_KEY
AZURE_OPENAI_CHAT_DEPLOYMENT=$AZURE_OPENAI_CHAT_DEPLOYMENT
AZURE_OPENAI_EMBED_DEPLOYMENT=$AZURE_OPENAI_EMBED_DEPLOYMENT
AZURE_OPENAI_EMBED_MODEL=$AZURE_OPENAI_EMBED_MODEL
$FLOOR_LINE
JWT_SECRET=$JWT_SECRET
CRON_SECRET=$CRON_SECRET
NEXT_PUBLIC_BASE_URL=https://$PUBLIC_HOST
HEIRLOOM_ALLOW_DEV_FIXTURES=0
VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY
VAPID_SUBJECT=mailto:admin@$PUBLIC_HOST
NEXT_PUBLIC_VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY
NEXT_PUBLIC_HEIRLOOM_DEMO_NOTICE=1
EOF
chown heirloom:heirloom "$ENV_FILE"; chmod 600 "$ENV_FILE"
ok "$ENV_FILE written (Azure OpenAI, demo banner on)"

# 8. App systemd unit -----------------------------------------------------
heading "Heirloom systemd unit"
cat > /etc/systemd/system/heirloom.service <<'EOF'
[Unit]
Description=Heirloom demo (Azure OpenAI)
After=network-online.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=heirloom
Group=heirloom
WorkingDirectory=/opt/heirloom/app
EnvironmentFile=/opt/heirloom/.env
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable heirloom.service
ok "heirloom.service registered"

# 9. Nightly Sagan reset --------------------------------------------------
# The demo accepts public submissions. A nightly timer drops the database
# and re-imports the pristine seed so the archive everyone sees stays the
# Sagan archive. reset-demo.sh lives in the app tree.
heading "Nightly reset timer"
cat > /etc/systemd/system/heirloom-reset.service <<'EOF'
[Unit]
Description=Restore the pristine Sagan demo archive
After=postgresql.service

[Service]
Type=oneshot
User=heirloom
Group=heirloom
WorkingDirectory=/opt/heirloom/app
EnvironmentFile=/opt/heirloom/.env
ExecStart=/usr/bin/bash /opt/heirloom/app/infra/reset-demo.sh
EOF
cat > /etc/systemd/system/heirloom-reset.timer <<'EOF'
[Unit]
Description=Nightly Sagan demo reset (08:00 UTC)

[Timer]
OnCalendar=*-*-* 08:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable heirloom-reset.timer
ok "nightly reset timer registered (08:00 UTC)"

# 10. Caddy + TLS + edge rate limiting -----------------------------------
heading "Caddy + TLS + rate limiting"
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  # The rate_limit handler is a community plugin; xcaddy build bakes it in.
  # If unavailable, Caddy still installs and serves without the limiter
  # (the app's own per-IP guards remain).
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y && apt-get install -y caddy
fi
# Rate limiting: cap the expensive endpoints per-IP. Uses the
# mholt/caddy-ratelimit plugin if present; the block is ignored by a
# stock Caddy, so this is safe either way, and the app enforces its own
# caps regardless.
cat > /etc/caddy/Caddyfile <<EOF
{
    order rate_limit before basicauth
}

$PUBLIC_HOST {
    @expensive path /api/reflect /api/capture /api/portal/import
    rate_limit @expensive {
        zone demo_expensive {
            key    {remote_host}
            events 20
            window 1m
        }
    }
    reverse_proxy 127.0.0.1:3000 {
        flush_interval -1
    }
    encode gzip zstd
    request_body {
        max_size 25MB
    }
    log {
        output file /var/log/caddy/heirloom.log {
            roll_size 50mb
            roll_keep 3
        }
    }
}
EOF
mkdir -p /var/log/caddy
systemctl enable caddy
if ! caddy validate --config /etc/caddy/Caddyfile 2>/dev/null; then
  note "rate_limit plugin absent; falling back to a Caddyfile without it"
  cat > /etc/caddy/Caddyfile <<EOF
$PUBLIC_HOST {
    reverse_proxy 127.0.0.1:3000 { flush_interval -1 }
    encode gzip zstd
    request_body { max_size 25MB }
    log {
        output file /var/log/caddy/heirloom.log { roll_size 50mb roll_keep 3 }
    }
}
EOF
fi
systemctl reload caddy 2>/dev/null || systemctl restart caddy
ok "Caddy at https://$PUBLIC_HOST -> :3000 (25 MB body cap)"

heading "Demo setup complete"
echo
echo "Next: rsync source to /opt/heirloom/app, then"
echo "  sudo bash /opt/heirloom/app/infra/build-and-start.sh"
echo "  sudo bash /opt/heirloom/app/infra/reset-demo.sh   # first seed import"

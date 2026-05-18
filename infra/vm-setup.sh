#!/usr/bin/env bash
# Heirloom - Ubuntu 22.04 CPU-only single-VM bootstrap.
#
# Runs ON the target VM as root (via cloud-init or `sudo bash`).
# Idempotent: safe to re-run to pick up new defaults.
#
# Required: PUBLIC_HOST=your.fqdn.example
# Optional: DB_PASS, DB_ADMIN_PASS, JWT_SECRET, VAPID_PUBLIC_KEY,
#           VAPID_PRIVATE_KEY, VAPID_SUBJECT (auto-generated if absent
#           on first run; preserved across re-runs).

set -euo pipefail

PUBLIC_HOST="${PUBLIC_HOST:?must provide PUBLIC_HOST=your.fqdn.example}"
ENV_FILE="/opt/heirloom/.env"

heading() { printf "\n\033[1;35m=== %s ===\033[0m\n" "$1"; }
ok()      { printf "  \033[32mok\033[0m  %s\n" "$1"; }
note()    { printf "  \033[90m..\033[0m  %s\n" "$1"; }

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

# Helper: load an existing key from the env file, or generate one and
# print it. Lets us preserve secrets across re-runs.
read_or_generate() {
  local key="$1"
  local generator="$2"
  if [[ -f "$ENV_FILE" ]] && grep -qE "^${key}=" "$ENV_FILE"; then
    grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2-
  else
    eval "$generator"
  fi
}

DB_PASS="${DB_PASS:-$(read_or_generate DATABASE_URL 'openssl rand -hex 16')}"
DB_ADMIN_PASS="${DB_ADMIN_PASS:-$(read_or_generate DATABASE_ADMIN_URL 'openssl rand -hex 16')}"
JWT_SECRET="${JWT_SECRET:-$(read_or_generate JWT_SECRET 'openssl rand -hex 32')}"

# DATABASE_URL / DATABASE_ADMIN_URL embed the password; pull just the
# password out if we're preserving them.
if [[ -f "$ENV_FILE" ]]; then
  EXISTING_DB_PASS=$(grep -E '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null \
      | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|' || true)
  EXISTING_ADMIN_PASS=$(grep -E '^DATABASE_ADMIN_URL=' "$ENV_FILE" 2>/dev/null \
      | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|' || true)
  [[ -n "${EXISTING_DB_PASS:-}" ]] && DB_PASS="$EXISTING_DB_PASS"
  [[ -n "${EXISTING_ADMIN_PASS:-}" ]] && DB_ADMIN_PASS="$EXISTING_ADMIN_PASS"
fi

# 1. Base packages -------------------------------------------------------
heading "Base packages"
apt-get update -y
apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    git \
    gnupg \
    lsb-release \
    openssl \
    ffmpeg \
    pkg-config \
    libssl-dev \
    debian-keyring \
    debian-archive-keyring \
    apt-transport-https \
    cmake \
    rsync
ok "base packages installed"

# 2. Node 22 + pnpm -------------------------------------------------------
heading "Node 22 + pnpm"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y --no-install-recommends nodejs
fi
ok "node $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@10
fi
ok "pnpm $(pnpm -v)"

# 3. PostgreSQL 16 + pgvector --------------------------------------------
heading "PostgreSQL 16 + pgvector"
if ! command -v psql >/dev/null 2>&1; then
  sh -c 'echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt jammy-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg
  apt-get update -y
  apt-get install -y --no-install-recommends \
      postgresql-16 \
      postgresql-server-dev-16 \
      postgresql-16-pgvector
fi
systemctl enable --now postgresql
sleep 2
ok "postgres $(psql --version | head -1)"

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
SELECT 'CREATE DATABASE heirloom'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'heirloom')\gexec
SQL

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heirloom_app') THEN
        CREATE ROLE heirloom_app LOGIN PASSWORD '$DB_PASS';
    ELSE
        ALTER ROLE heirloom_app WITH PASSWORD '$DB_PASS';
    END IF;
END
\$\$;
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

# 4. Ollama (CPU mode) ---------------------------------------------------
heading "Ollama (CPU)"
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
cat > /etc/systemd/system/ollama.service <<'EOF'
[Unit]
Description=Ollama serving Heirloom (CPU)
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/ollama serve
Environment=OLLAMA_HOST=127.0.0.1:11434
Environment=OLLAMA_FLASH_ATTENTION=0
Environment=OLLAMA_KEEP_ALIVE=30m
Environment=OLLAMA_NUM_PARALLEL=2
Restart=always
RestartSec=5
User=ollama
Group=ollama
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now ollama
sleep 5
ok "ollama serving on 127.0.0.1:11434"

cat > /etc/systemd/system/ollama-warmup.service <<'WARMUP'
[Unit]
Description=Pre-warm Gemma 4 + EmbeddingGemma after Ollama starts
Requires=ollama.service
After=ollama.service

[Service]
Type=oneshot
ExecStart=/bin/sh -c "until curl -fsS http://127.0.0.1:11434/api/version >/dev/null; do sleep 2; done; \
    curl -sS http://127.0.0.1:11434/api/chat -H content-type:application/json \
      -d '{\"model\":\"gemma4:e4b\",\"messages\":[{\"role\":\"user\",\"content\":\"ok\"}],\"stream\":false,\"think\":false,\"options\":{\"num_predict\":4}}' > /dev/null; \
    curl -sS http://127.0.0.1:11434/api/embed -H content-type:application/json \
      -d '{\"model\":\"embeddinggemma\",\"input\":\"hello\"}' > /dev/null"
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
WARMUP
systemctl daemon-reload
systemctl enable --now ollama-warmup
ok "ollama-warmup unit registered"

if ! sudo -u ollama ollama list 2>/dev/null | grep -q '^gemma4:e4b'; then
  note "Pulling gemma4:e4b (9.6 GB) - takes ~5 minutes"
  sudo -u ollama ollama pull gemma4:e4b
fi
if ! sudo -u ollama ollama list 2>/dev/null | grep -q '^embeddinggemma'; then
  note "Pulling embeddinggemma (621 MB)"
  sudo -u ollama ollama pull embeddinggemma
fi
ok "models in place"

# 5. whisper-cpp ----------------------------------------------------------
heading "whisper-cpp"
if ! command -v whisper-cli >/dev/null 2>&1; then
  cd /opt
  if [[ ! -d whisper.cpp ]]; then
    git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git
  fi
  cd whisper.cpp
  cmake -B build -DCMAKE_BUILD_TYPE=Release >/dev/null
  cmake --build build --config Release -j"$(nproc)" >/dev/null
  bash models/download-ggml-model.sh small.en
  install -m 0755 build/bin/whisper-cli /usr/local/bin/whisper-cli
fi
ok "whisper-cli ready"

# 6. Heirloom system user + app dir --------------------------------------
heading "App user + directory"
if ! id heirloom >/dev/null 2>&1; then
  useradd -r -m -d /opt/heirloom -s /bin/bash heirloom
fi
mkdir -p /opt/heirloom/app /opt/heirloom/app/storage/blobs
chown -R heirloom:heirloom /opt/heirloom
ok "user 'heirloom' + /opt/heirloom/app ready"

# 7. VAPID keys for Web Push ---------------------------------------------
heading "Web Push (VAPID) keys"
VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY:-}"
VAPID_PRIVATE_KEY="${VAPID_PRIVATE_KEY:-}"
VAPID_SUBJECT="${VAPID_SUBJECT:-mailto:admin@$PUBLIC_HOST}"
if [[ -f "$ENV_FILE" ]]; then
  EXISTING_VPUB=$(grep -E '^VAPID_PUBLIC_KEY=' "$ENV_FILE" | cut -d= -f2- || true)
  EXISTING_VPRIV=$(grep -E '^VAPID_PRIVATE_KEY=' "$ENV_FILE" | cut -d= -f2- || true)
  [[ -n "${EXISTING_VPUB:-}" ]] && VAPID_PUBLIC_KEY="$EXISTING_VPUB"
  [[ -n "${EXISTING_VPRIV:-}" ]] && VAPID_PRIVATE_KEY="$EXISTING_VPRIV"
fi
if [[ -z "$VAPID_PUBLIC_KEY" || -z "$VAPID_PRIVATE_KEY" ]]; then
  note "Generating VAPID keypair via npx web-push"
  VAPID_JSON=$(npx -y web-push generate-vapid-keys --json 2>/dev/null)
  VAPID_PUBLIC_KEY=$(echo "$VAPID_JSON" | grep -oE '"publicKey"\s*:\s*"[^"]+"' | sed -E 's/.*"([^"]+)"$/\1/')
  VAPID_PRIVATE_KEY=$(echo "$VAPID_JSON" | grep -oE '"privateKey"\s*:\s*"[^"]+"' | sed -E 's/.*"([^"]+)"$/\1/')
fi
ok "VAPID keys present"

# 8. Environment file ----------------------------------------------------
# DEMO_NOTICE: set NEXT_PUBLIC_HEIRLOOM_DEMO_NOTICE=1 before running
# setup (or in the existing env file) to show a public-demo banner above
# the app. Off by default for normal self-hosters.
DEMO_NOTICE="${NEXT_PUBLIC_HEIRLOOM_DEMO_NOTICE:-}"
if [[ -z "$DEMO_NOTICE" && -f "$ENV_FILE" ]]; then
  DEMO_NOTICE=$(grep -E '^NEXT_PUBLIC_HEIRLOOM_DEMO_NOTICE=' "$ENV_FILE" \
      | cut -d= -f2- || true)
fi
DEMO_NOTICE="${DEMO_NOTICE:-0}"

heading "Environment"
umask 077
cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://heirloom_app:$DB_PASS@127.0.0.1:5432/heirloom
DATABASE_ADMIN_URL=postgres://postgres:$DB_ADMIN_PASS@127.0.0.1:5432/heirloom
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_SYNTHESIS_MODEL=heirloom/gemma4-grounded
OLLAMA_EMBEDDING_MODEL=embeddinggemma
JWT_SECRET=$JWT_SECRET
NEXT_PUBLIC_BASE_URL=https://$PUBLIC_HOST
HEIRLOOM_ALLOW_DEV_FIXTURES=0
VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY
VAPID_SUBJECT=$VAPID_SUBJECT
NEXT_PUBLIC_VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY
NEXT_PUBLIC_HEIRLOOM_DEMO_NOTICE=$DEMO_NOTICE
EOF
chown heirloom:heirloom "$ENV_FILE"
chmod 600 "$ENV_FILE"
ok "$ENV_FILE written"

# 9. systemd unit for the Next.js app ------------------------------------
heading "Heirloom systemd unit"
cat > /etc/systemd/system/heirloom.service <<'EOF'
[Unit]
Description=Heirloom Next.js app
After=network-online.target postgresql.service ollama.service
Requires=postgresql.service ollama.service

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
ok "heirloom.service registered + enabled (start via build-and-start.sh)"

# 10. Caddy reverse proxy + TLS ------------------------------------------
heading "Caddy + TLS"
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y
  apt-get install -y caddy
fi
cat > /etc/caddy/Caddyfile <<EOF
$PUBLIC_HOST {
    reverse_proxy 127.0.0.1:3000 {
        flush_interval -1
    }
    encode gzip zstd
    request_body {
        max_size 200MB
    }
    log {
        output file /var/log/caddy/heirloom.log {
            roll_size 50mb
            roll_keep 3
        }
    }
}
EOF
systemctl enable caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy
ok "Caddy proxy at https://$PUBLIC_HOST -> :3000"

# 11. Done ----------------------------------------------------------------
heading "Setup phase complete"
echo
echo "Next step (run from your laptop):"
echo "  rsync the source to /opt/heirloom/app, then"
echo "  ssh in and run: sudo bash /opt/heirloom/app/infra/build-and-start.sh"

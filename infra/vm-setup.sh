#!/usr/bin/env bash
# Heirloom — Ubuntu 22.04 CPU-only single-VM bootstrap.
#
# Runs ON the target VM as root (via cloud-init or `sudo bash`). Brings
# up everything needed for the hosted demo: Node + pnpm, Ollama (CPU),
# whisper-cpp, PostgreSQL 16 + pgvector, ffmpeg, Caddy with automatic
# TLS.
#
# The Heirloom app itself is rsync'd in separately from the deploy
# script; this file leaves a placeholder systemd unit pointed at
# /opt/heirloom/app that the deploy step will populate.

set -euo pipefail

PUBLIC_HOST="${PUBLIC_HOST:?must provide PUBLIC_HOST=heirloom-xxx.region.cloudapp.azure.com}"
DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"
DB_ADMIN_PASS="${DB_ADMIN_PASS:-$(openssl rand -hex 16)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"

heading() { printf "\n\033[1;35m=== %s ===\033[0m\n" "$1"; }
ok()      { printf "  \033[32mok\033[0m  %s\n" "$1"; }
note()    { printf "  \033[90m..\033[0m  %s\n" "$1"; }

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

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
    cmake
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

# Initialise the database + app role idempotently.
# CREATE DATABASE can't run inside a DO block, so we use psql's \gexec
# and a separate DO for the role.
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
-- Set a password on the postgres superuser too — sqlAdmin connects
-- over TCP from the Heirloom node process and needs password auth.
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
# Override the unit to run on localhost with sane CPU defaults
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

# Warm-up unit — fires a tiny inference + embed after Ollama starts so
# the first real user request doesn't pay the ~10-15 s cold-load tax.
# Keeps both models resident inside OLLAMA_KEEP_ALIVE=30m.
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

note "Pulling gemma4:e4b (9.6 GB) — this takes ~5 minutes"
sudo -u ollama ollama pull gemma4:e4b
note "Pulling embeddinggemma (621 MB)"
sudo -u ollama ollama pull embeddinggemma
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

# 7. Environment file (consumed by the systemd unit) ---------------------
heading "Environment"
cat > /opt/heirloom/.env <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://heirloom_app:$DB_PASS@127.0.0.1:5432/heirloom
DATABASE_ADMIN_URL=postgres://postgres:$DB_ADMIN_PASS@127.0.0.1:5432/heirloom
OLLAMA_BASE_URL=http://127.0.0.1:11434
JWT_SECRET=$JWT_SECRET
NEXT_PUBLIC_BASE_URL=https://$PUBLIC_HOST
EOF
chown heirloom:heirloom /opt/heirloom/.env
chmod 600 /opt/heirloom/.env
ok "/opt/heirloom/.env written"

# 8. systemd unit for the Next.js app ------------------------------------
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
# Don't start yet — the deploy step still needs to rsync the code + build
ok "heirloom.service registered (not started)"

# 9. Caddy reverse proxy + TLS -------------------------------------------
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
        max_size 60MB
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

# 10. Done ----------------------------------------------------------------
heading "Setup phase complete"
echo
echo "Next step (run from your laptop):"
echo "  rsync the Heirloom source to /opt/heirloom/app, then"
echo "  ssh in and run /opt/heirloom/build-and-start.sh"

#!/usr/bin/env bash
# Heirloom — one-command local install
#
# Brings up the full local-first stack:
#   - Ollama (gemma4:e4b + embeddinggemma)
#   - whisper-cpp (small.en) for audio transcription
#   - Postgres 16 + pgvector
#   - Node.js dependencies + DB migrations
#   - Heirloom on http://localhost:3000
#
# Tested on macOS (Apple Silicon). Linux requires the matching package
# managers — see docs/INSTALL-LINUX.md (not yet shipped).

set -euo pipefail

heading() { printf "\n\033[1;35m▸ %s\033[0m\n" "$1"; }
ok()      { printf "  \033[32m✓ %s\033[0m\n" "$1"; }
note()    { printf "  \033[90m· %s\033[0m\n" "$1"; }
warn()    { printf "  \033[33m! %s\033[0m\n" "$1"; }
fail()    { printf "  \033[31m✗ %s\033[0m\n" "$1"; exit 1; }

if [[ "$OSTYPE" != "darwin"* ]]; then
  fail "install.sh currently supports macOS only. See docs/INSTALL-LINUX.md."
fi

# 1. Homebrew --------------------------------------------------------------
heading "Homebrew"
if ! command -v brew >/dev/null 2>&1; then
  note "Installing Homebrew (you may be prompted for your password)"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
ok "brew $(brew --version | head -1)"

# 2. Ollama ----------------------------------------------------------------
heading "Ollama"
if ! command -v ollama >/dev/null 2>&1; then
  note "Installing Ollama"
  brew install ollama
fi
if ! pgrep -x ollama >/dev/null 2>&1; then
  note "Starting Ollama daemon"
  ( OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 nohup ollama serve >/tmp/heirloom-ollama.log 2>&1 & disown ) || true
  sleep 2
fi
ok "ollama $(ollama --version 2>/dev/null | head -1 || echo running)"

note "Pulling gemma4:e4b (≈9.6 GB) and embeddinggemma (≈621 MB)"
ollama pull gemma4:e4b
ollama pull embeddinggemma
ok "models ready"

# Optional: build the grounded variant locally if the Modelfile is present
if [[ -f Modelfile ]]; then
  note "Building heirloom/gemma4-grounded from Modelfile"
  ollama create heirloom/gemma4-grounded -f Modelfile >/dev/null
  ok "heirloom/gemma4-grounded built"
fi

# 3. Whisper ---------------------------------------------------------------
heading "Whisper (audio transcription)"
if ! command -v whisper-cli >/dev/null 2>&1; then
  note "Installing whisper-cpp"
  brew install whisper-cpp
fi
ok "whisper-cli ready"

# 4. ffmpeg ----------------------------------------------------------------
heading "ffmpeg"
if ! command -v ffmpeg >/dev/null 2>&1; then
  note "Installing ffmpeg"
  brew install ffmpeg
fi
ok "ffmpeg ready"

# 5. Postgres + pgvector ---------------------------------------------------
heading "Postgres + pgvector"
if ! command -v psql >/dev/null 2>&1; then
  note "Installing postgresql@16"
  brew install postgresql@16
  brew services start postgresql@16
fi
# pgvector ships as a separate formula on macOS
if ! brew list pgvector >/dev/null 2>&1; then
  note "Installing pgvector"
  brew install pgvector
fi
DB_NAME=${HEIRLOOM_DB_NAME:-heirloom}
PG_USER=$(whoami)
if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null | grep -q 1; then
  note "Creating database '$DB_NAME'"
  createdb "$DB_NAME"
fi
psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null
psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" >/dev/null
psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS citext;" >/dev/null
psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null
ok "database '$DB_NAME' ready with pgvector"

# Create the app role if missing
if ! psql -d "$DB_NAME" -tAc "SELECT 1 FROM pg_roles WHERE rolname='heirloom_app'" | grep -q 1; then
  note "Creating role 'heirloom_app'"
  psql -d "$DB_NAME" -c "CREATE ROLE heirloom_app LOGIN PASSWORD 'heirloom_dev';" >/dev/null
fi
psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO heirloom_app;" >/dev/null
psql -d "$DB_NAME" -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO heirloom_app;" >/dev/null
psql -d "$DB_NAME" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO heirloom_app;" >/dev/null
ok "heirloom_app role configured"

# 6. Apply migrations ------------------------------------------------------
heading "Schema migrations"
if [[ -f design-system/handoff/SCHEMA.sql ]]; then
  psql -d "$DB_NAME" -f design-system/handoff/SCHEMA.sql >/dev/null 2>&1 || true
  ok "base schema applied"
fi
for mig in migrations/*.sql; do
  [[ -e "$mig" ]] || continue
  note "Applying $(basename "$mig")"
  psql -d "$DB_NAME" -f "$mig" >/dev/null
done
ok "all migrations applied"

# 7. Node deps -------------------------------------------------------------
heading "Node.js + dependencies"
if ! command -v pnpm >/dev/null 2>&1; then
  note "Installing pnpm"
  brew install pnpm
fi
note "pnpm install"
pnpm install --silent
ok "dependencies installed"

# 8. .env.local ------------------------------------------------------------
heading "Environment"
if [[ ! -f .env.local ]]; then
  cat > .env.local <<EOF
DATABASE_URL=postgres://heirloom_app:heirloom_dev@localhost:5432/$DB_NAME
DATABASE_ADMIN_URL=postgres://$PG_USER@localhost:5432/$DB_NAME
OLLAMA_BASE_URL=http://localhost:11434
JWT_SECRET=$(openssl rand -hex 32)
EOF
  ok ".env.local created"
else
  ok ".env.local already exists"
fi

# 9. Done ------------------------------------------------------------------
heading "Ready"
ok "Run:    pnpm dev"
ok "Open:   http://localhost:3000"
ok "Dev:    http://localhost:3000/dev — switch identities, bootstrap test data"
echo
note "First-time creator? You'll be walked through onboarding."
note "Want the nominee view? POST /api/dev/nominee or use /dev console."
note "Audio capture needs HTTPS — tunnel via ngrok or run a real domain."

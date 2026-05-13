#!/usr/bin/env bash
# Heirloom — Azure NCv4 (Tesla T4) VM bootstrap.
#
# Run on a fresh Ubuntu 22.04 VM with sudo:
#   curl -fsSL https://raw.githubusercontent.com/<you>/heirloom/main/infra/azure-vm-setup.sh | sudo bash
#
# What it does:
#   1. Installs NVIDIA driver + CUDA runtime
#   2. Installs Ollama via the official script
#   3. Pulls gemma4:e4b + embeddinggemma
#   4. Installs whisper-cpp + builds small.en
#   5. Installs Caddy with automatic TLS
#   6. Sets up systemd units so everything survives reboot
#
# Idempotent — re-running is safe.

set -euo pipefail

INFER_HOST="${INFER_HOST:-infer.heirloom.app}"

heading() { printf "\n\033[1;35m=== %s ===\033[0m\n" "$1"; }
ok()      { printf "  \033[32mok\033[0m  %s\n" "$1"; }
note()    { printf "  \033[90m..\033[0m  %s\n" "$1"; }

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0" >&2
  exit 1
fi

# 1. NVIDIA driver --------------------------------------------------------
heading "NVIDIA driver + CUDA"
if ! command -v nvidia-smi >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y --no-install-recommends build-essential ubuntu-drivers-common
  ubuntu-drivers autoinstall
  note "Driver installed -- REBOOT REQUIRED before continuing"
  echo
  echo "Run: sudo reboot, then re-run this script."
  exit 0
fi
nvidia-smi -L | head -1
ok "GPU visible"

# 2. Ollama ---------------------------------------------------------------
heading "Ollama"
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
ok "ollama $(ollama --version | head -1)"

cat > /etc/systemd/system/ollama.service <<'EOF'
[Unit]
Description=Ollama serving Heirloom
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/ollama serve
Environment=OLLAMA_HOST=127.0.0.1:11434
Environment=OLLAMA_FLASH_ATTENTION=1
Environment=OLLAMA_KV_CACHE_TYPE=q8_0
Environment=OLLAMA_KEEP_ALIVE=10m
Restart=always
User=ollama
Group=ollama

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now ollama
sleep 5

note "Pulling gemma4:e4b (9.6 GB) and embeddinggemma (621 MB)"
sudo -u ollama ollama pull gemma4:e4b
sudo -u ollama ollama pull embeddinggemma
ok "models in place"

# 3. whisper-cpp ----------------------------------------------------------
heading "whisper-cpp"
if ! command -v whisper-cli >/dev/null 2>&1; then
  cd /opt
  git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git
  cd whisper.cpp
  make -j"$(nproc)"
  bash models/download-ggml-model.sh small.en
  install -m 0755 main /usr/local/bin/whisper-cli
fi
ok "whisper-cli ready"

# 4. ffmpeg ---------------------------------------------------------------
heading "ffmpeg"
apt-get install -y --no-install-recommends ffmpeg
ok "ffmpeg ready"

# 5. Caddy reverse proxy + TLS -------------------------------------------
heading "Caddy + TLS"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y --no-install-recommends debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
      | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
cat > /etc/caddy/Caddyfile <<EOF
$INFER_HOST {
    reverse_proxy 127.0.0.1:11434
    encode gzip zstd
    log {
        output file /var/log/caddy/heirloom-infer.log {
            roll_size 50mb
            roll_keep 3
        }
    }
}
EOF
systemctl reload caddy
ok "TLS reverse proxy at https://$INFER_HOST"

# 6. Health check ---------------------------------------------------------
heading "Health check"
sleep 2
curl -fsSL "https://$INFER_HOST/api/version" || true
echo
ok "Setup complete"

echo
echo "Next steps from your workstation:"
echo "  1. Point Vercel's OLLAMA_BASE_URL at https://$INFER_HOST"
echo "  2. Apply migrations against your Neon DB"
echo "  3. vercel --prod"

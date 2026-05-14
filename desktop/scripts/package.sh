#!/usr/bin/env bash
# Package Heirloom as a macOS .dmg with Ollama + Whisper sidecars and a
# self-contained Next.js standalone server. Run from the project root.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

heading() { printf "\n\033[1;35m=== %s ===\033[0m\n" "$1"; }
ok()      { printf "  \033[32mok\033[0m  %s\n" "$1"; }
note()    { printf "  \033[90m..\033[0m  %s\n" "$1"; }

# Target triple Tauri expects for the bundled sidecars.
TRIPLE="aarch64-apple-darwin"
case "$(uname -m)" in
  x86_64) TRIPLE="x86_64-apple-darwin" ;;
esac

# 1. Build the Next.js standalone bundle ---------------------------------
heading "Next.js production build"
HEIRLOOM_BACKEND=sqlite pnpm build > /dev/null
ok "next build done"

# 2. Stage sidecar binaries with target-triple suffixes ------------------
heading "Sidecars"
SIDE="desktop/bin"
mkdir -p "$SIDE"

OLLAMA_SRC="$(readlink -f "$(command -v ollama)" 2>/dev/null || true)"
if [[ -z "$OLLAMA_SRC" || ! -x "$OLLAMA_SRC" ]]; then
  echo "ollama not on PATH — install via brew or grab the binary from ollama.com" >&2
  exit 1
fi
cp -f "$OLLAMA_SRC" "$SIDE/ollama-$TRIPLE"
chmod +x "$SIDE/ollama-$TRIPLE"
ok "ollama-$TRIPLE staged"

WHISPER_SRC="$(readlink -f "$(command -v whisper-cli)" 2>/dev/null || true)"
if [[ -z "$WHISPER_SRC" || ! -x "$WHISPER_SRC" ]]; then
  echo "whisper-cli not on PATH — install via brew install whisper-cpp" >&2
  exit 1
fi
cp -f "$WHISPER_SRC" "$SIDE/whisper-cli-$TRIPLE"
chmod +x "$SIDE/whisper-cli-$TRIPLE"
ok "whisper-cli-$TRIPLE staged"

NODE_SRC="$(readlink -f "$(command -v node)")"
cp -f "$NODE_SRC" "$SIDE/node-$TRIPLE"
chmod +x "$SIDE/node-$TRIPLE"
ok "node-$TRIPLE staged"

# 3. Stage the Next.js standalone server next to the binaries -----------
# Next traces dependencies into .next/standalone/, but on this codebase
# Turbopack's NFT widens to the whole project tree (anything reachable
# through dynamic path.join'd paths). We copy only the files the server
# actually needs to boot.
heading "Server bundle"
SERVER_OUT="desktop/server"
rm -rf "$SERVER_OUT"
mkdir -p "$SERVER_OUT/.next"

cp .next/standalone/server.js "$SERVER_OUT/"
cp .next/standalone/package.json "$SERVER_OUT/"
cp -R .next/standalone/node_modules "$SERVER_OUT/node_modules"
cp -R .next/standalone/.next/. "$SERVER_OUT/.next/"
cp -R .next/static/. "$SERVER_OUT/.next/static/"

# Next's NFT misses sqlite-vec's require.resolve(`sqlite-vec-${os}-${arch}/vec0.dylib`).
# Copy the loader + platform binary directly.
SV_HOSTED="$SERVER_OUT/node_modules/.pnpm/sqlite-vec@0.1.9/node_modules/sqlite-vec"
SV_PLATFORM="$SERVER_OUT/node_modules/.pnpm/sqlite-vec-darwin-arm64@0.1.9/node_modules/sqlite-vec-darwin-arm64"
mkdir -p "$SV_HOSTED" "$SV_PLATFORM"
cp -R node_modules/sqlite-vec/. "$SV_HOSTED/"
cp -R node_modules/.pnpm/sqlite-vec-darwin-arm64@0.1.9/node_modules/sqlite-vec-darwin-arm64/. "$SV_PLATFORM/"
ln -snf .pnpm/sqlite-vec@0.1.9/node_modules/sqlite-vec "$SERVER_OUT/node_modules/sqlite-vec"
ln -snf .pnpm/sqlite-vec-darwin-arm64@0.1.9/node_modules/sqlite-vec-darwin-arm64 "$SERVER_OUT/node_modules/sqlite-vec-darwin-arm64"

# Public assets + the SQLite schema applied on first boot
mkdir -p "$SERVER_OUT/public" "$SERVER_OUT/migrations/sqlite"
cp -R public/. "$SERVER_OUT/public/"
cp -R migrations/sqlite/. "$SERVER_OUT/migrations/sqlite/"

ok "server staged at $SERVER_OUT"
du -sh "$SERVER_OUT" 2>&1 | sed 's/^/  /'

# 4. Build the Tauri .app + .dmg ----------------------------------------
heading "Tauri bundle"
HEIRLOOM_BACKEND=sqlite pnpm exec tauri build --config desktop/src-tauri/tauri.conf.json
ok "tauri build done"

# 5. Inject the standalone server tree into the .app ----------------------
# Tauri's resources globs flatten directory structure (a known limitation),
# so we mirror desktop/server/ into Contents/Resources/server/ directly.
APP_DIR="desktop/src-tauri/target/release/bundle/macos/Heirloom.app"
TARGET_SERVER="$APP_DIR/Contents/Resources/server"
rm -rf "$TARGET_SERVER"
cp -R desktop/server "$TARGET_SERVER"
ok "server copied into bundle ($(du -sh "$TARGET_SERVER" | cut -f1))"

# 6. Re-pack the dmg now that the bundle is complete ----------------------
heading "Repack .dmg"
rm -f desktop/src-tauri/target/release/bundle/dmg/*.dmg
hdiutil create -volname Heirloom \
    -srcfolder "$APP_DIR" \
    -ov -format UDZO \
    desktop/src-tauri/target/release/bundle/dmg/Heirloom.dmg > /dev/null
ok "dmg repacked"

note "Bundle output:"
ls -lh desktop/src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null || true

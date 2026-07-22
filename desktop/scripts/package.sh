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
  echo "ollama not on PATH - install via brew or grab the binary from ollama.com" >&2
  exit 1
fi
cp -f "$OLLAMA_SRC" "$SIDE/ollama-$TRIPLE"
chmod +x "$SIDE/ollama-$TRIPLE"
ok "ollama-$TRIPLE staged"

WHISPER_SRC="$(readlink -f "$(command -v whisper-cli)" 2>/dev/null || true)"
if [[ -z "$WHISPER_SRC" || ! -x "$WHISPER_SRC" ]]; then
  echo "whisper-cli not on PATH - install via brew install whisper-cpp" >&2
  exit 1
fi
cp -f "$WHISPER_SRC" "$SIDE/whisper-cli-$TRIPLE"
chmod +x "$SIDE/whisper-cli-$TRIPLE"
ok "whisper-cli-$TRIPLE staged"

# whisper-cli's dyld references absolute homebrew paths. We capture the
# three libraries it needs so the post-bundle step can stage them next
# to the binary with the rpaths rewritten.
WHISPER_LIB_DIR="$(brew --prefix whisper-cpp 2>/dev/null)/lib"
GGML_LIB_DIR="$(brew --prefix ggml 2>/dev/null)/lib"
if [[ ! -f "$WHISPER_LIB_DIR/libwhisper.1.dylib" || ! -f "$GGML_LIB_DIR/libggml.0.dylib" ]]; then
  echo "whisper-cpp / ggml libraries not found - reinstall via brew" >&2
  exit 1
fi
ok "whisper dylibs located"

# Whisper speech model. small.en (~466 MB) — the code (src/lib/whisper.ts)
# and the self-host installs default to it for its better accuracy on the
# short, often-emotional voice notes people leave here. Bundling base.en
# here would leave the packaged app resolving a small.en path with no
# small.en present. Downloaded on first package run, cached locally.
WHISPER_MODEL="storage/whisper-models/ggml-small.en.bin"
if [[ ! -f "$WHISPER_MODEL" ]]; then
  mkdir -p "$(dirname "$WHISPER_MODEL")"
  curl -fsSL -o "$WHISPER_MODEL" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin" \
    || { echo "couldn't fetch whisper model" >&2; exit 1; }
fi
ok "whisper model present ($(du -h "$WHISPER_MODEL" | cut -f1))"

NODE_SRC="$(readlink -f "$(command -v node)")"
cp -f "$NODE_SRC" "$SIDE/node-$TRIPLE"
chmod +x "$SIDE/node-$TRIPLE"
ok "node-$TRIPLE staged"

# 3. Stage the Next.js standalone server next to the binaries -----------
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

# 4. Build the Tauri .app ------------------------------------------------
# Only the .app target: tauri's built-in DMG step shells out to
# create-dmg's AppleScript (Finder icon layout), which fails in any
# non-GUI / automated run. We assemble the DMG ourselves in stage 6 with
# hdiutil, which needs no Finder.
heading "Tauri bundle (.app only)"
HEIRLOOM_BACKEND=sqlite pnpm exec tauri build --bundles app \
  --config desktop/src-tauri/tauri.conf.json
ok "tauri build done"

# 5. Inject the standalone server tree into the .app ----------------------
# Tauri's resources globs flatten directory structure, so mirror
# desktop/server/ into Contents/Resources/server/ directly.
APP_DIR="desktop/src-tauri/target/release/bundle/macos/Heirloom.app"
TARGET_SERVER="$APP_DIR/Contents/Resources/server"
rm -rf "$TARGET_SERVER"
cp -R desktop/server "$TARGET_SERVER"
ok "server copied into bundle ($(du -sh "$TARGET_SERVER" | cut -f1))"

# 5a. Stage whisper-cpp libraries next to whisper-cli + rewrite rpaths --
# Tauri's externalBin only carries the executable; the dyld references
# in whisper-cli point at absolute /opt/homebrew paths that won't exist
# on a user's machine. Copy each dependent dylib into Contents/MacOS/
# and rewrite the load paths to be relative to the executable.
APP_MACOS="$APP_DIR/Contents/MacOS"
cp -f "$WHISPER_LIB_DIR/libwhisper.1.8.4.dylib" "$APP_MACOS/libwhisper.1.dylib"
cp -f "$GGML_LIB_DIR/libggml.0.11.1.dylib"       "$APP_MACOS/libggml.0.dylib"
cp -f "$GGML_LIB_DIR/libggml-base.0.11.1.dylib"  "$APP_MACOS/libggml-base.0.dylib"
chmod +w "$APP_MACOS/libwhisper.1.dylib" "$APP_MACOS/libggml.0.dylib" "$APP_MACOS/libggml-base.0.dylib"

install_name_tool -id "@executable_path/libwhisper.1.dylib"   "$APP_MACOS/libwhisper.1.dylib"
install_name_tool -id "@executable_path/libggml.0.dylib"       "$APP_MACOS/libggml.0.dylib"
install_name_tool -id "@executable_path/libggml-base.0.dylib"  "$APP_MACOS/libggml-base.0.dylib"

install_name_tool \
  -change "@rpath/libwhisper.1.dylib" "@executable_path/libwhisper.1.dylib" \
  -change "/opt/homebrew/opt/ggml/lib/libggml.0.dylib" "@executable_path/libggml.0.dylib" \
  -change "/opt/homebrew/opt/ggml/lib/libggml-base.0.dylib" "@executable_path/libggml-base.0.dylib" \
  "$APP_MACOS/whisper-cli"
install_name_tool \
  -change "/opt/homebrew/opt/ggml/lib/libggml.0.dylib" "@executable_path/libggml.0.dylib" \
  -change "/opt/homebrew/opt/ggml/lib/libggml-base.0.dylib" "@executable_path/libggml-base.0.dylib" \
  "$APP_MACOS/libwhisper.1.dylib"
install_name_tool \
  -change "@rpath/libggml-base.0.dylib" "@executable_path/libggml-base.0.dylib" \
  -change "/opt/homebrew/opt/ggml/lib/libggml-base.0.dylib" "@executable_path/libggml-base.0.dylib" \
  "$APP_MACOS/libggml.0.dylib"
codesign --force --sign - "$APP_MACOS/libwhisper.1.dylib" "$APP_MACOS/libggml.0.dylib" "$APP_MACOS/libggml-base.0.dylib" "$APP_MACOS/whisper-cli" 2>/dev/null || true
ok "whisper dylibs staged + rpaths rewritten"

# Whisper speech model into Resources so the bundled server can find
# it via HEIRLOOM_WHISPER_MODEL.
TARGET_MODEL_DIR="$APP_DIR/Contents/Resources/whisper-models"
mkdir -p "$TARGET_MODEL_DIR"
cp -f "$WHISPER_MODEL" "$TARGET_MODEL_DIR/"
ok "whisper model copied ($(du -h "$TARGET_MODEL_DIR" | tail -1 | cut -f1))"

# 5b. Stage the TTS sidecar source + installer in Resources/tts ----------
# The venv (LuxTTS + torch ~ 2 GB) isn't bundled; install-tts.sh sets
# it up under ~/Library/Application Support/Heirloom/tts/ on first
# run. The Rust shell auto-spawns the sidecar when that path exists.
TARGET_TTS="$APP_DIR/Contents/Resources/tts"
rm -rf "$TARGET_TTS"
mkdir -p "$TARGET_TTS"
cp infra/tts-server/server.py        "$TARGET_TTS/"
cp infra/tts-server/requirements.txt "$TARGET_TTS/"
cp infra/tts-server/README.md        "$TARGET_TTS/" 2>/dev/null || true
cp desktop/scripts/install-tts.sh    "$TARGET_TTS/"
chmod +x "$TARGET_TTS/install-tts.sh"
ok "tts sidecar source + installer staged (run with 'open $TARGET_TTS/install-tts.sh' or via Settings)"

# 6. Assemble the .dmg with hdiutil (no Finder / AppleScript) ------------
# A staging folder holds the injected .app plus an /Applications symlink
# so the DMG is drag-to-install. hdiutil compresses it (UDZO). This is
# less visually styled than create-dmg's laid-out window, but it builds
# anywhere, including headless.
heading "Assemble .dmg"
DMG_DIR="desktop/src-tauri/target/release/bundle/dmg"
mkdir -p "$DMG_DIR"
rm -f "$DMG_DIR"/*.dmg
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$APP_DIR" "$STAGE/Heirloom.app"
ln -s /Applications "$STAGE/Applications"
APP_VERSION="$(python3 -c "import json;print(json.load(open('desktop/src-tauri/tauri.conf.json'))['version'])")"
DMG_OUT="$DMG_DIR/Heirloom_${APP_VERSION}_aarch64.dmg"
hdiutil create -volname "Heirloom" \
  -srcfolder "$STAGE" \
  -fs HFS+ -format UDZO -ov \
  "$DMG_OUT" > /dev/null
# Also expose a stable, version-less name for the marketing download link.
cp -f "$DMG_OUT" "$DMG_DIR/Heirloom.dmg"
ok "dmg assembled ($(du -h "$DMG_OUT" | cut -f1))"

note "Bundle output:"
ls -lh "$DMG_DIR"/*.dmg 2>/dev/null || true

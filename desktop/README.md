# Heirloom - desktop bundle

Tauri-bundled macOS `.dmg` that runs the same Heirloom code as the
web app, but fully self-contained:

```
Heirloom.app
├── Contents/MacOS/
│   ├── heirloom         ← Tauri shell, supervises sidecars
│   ├── ollama           ← bundled Ollama (~36 MB)
│   ├── node             ← Node 22 runtime (~107 MB)
│   └── whisper-cli      ← whisper.cpp (~650 KB)
└── Contents/Resources/
    ├── server/          ← embedded Next.js standalone server
    │   ├── server.js
    │   ├── .next/
    │   ├── node_modules/    ← better-sqlite3 + sqlite-vec
    │   ├── public/
    │   └── migrations/sqlite/001_schema.sql
    └── tts/             ← optional voice-cloning sidecar
        ├── server.py
        ├── requirements.txt
        └── install-tts.sh
```

On launch the shell:

1. Resolves a per-user app-data directory under
   `~/Library/Application Support/Heirloom/` (DB + blobs + Ollama
   model cache live here so uninstall = `rm -rf`).
2. Spawns Ollama on `127.0.0.1:11434` with `OLLAMA_MODELS` pointed at
   the app-data dir.
3. If `<app_data>/tts/run.sh` exists (created by `install-tts.sh`),
   spawns the LuxTTS voice-cloning sidecar on `127.0.0.1:11435`.
   Otherwise voice features stay disabled - text, photo, retrieval
   all work unchanged.
4. Spawns the bundled Node + Next.js server with
   `HEIRLOOM_BACKEND=sqlite` on the first free port from a fixed
   candidate set (`47384-47387`) that the splash page also knows.
5. Opens a WKWebView at the bundled splash page. On first run the
   splash walks the user through the one-time model download - it
   drives Ollama's `/api/pull` directly and renders per-model
   progress (size, rate, ETA), then builds the grounded model
   variant. Once the models are present it probes the candidate
   ports for `/api/health` and pivots to the live app. No terminal
   involved at any point.
6. On exit, SIGTERMs all children so they don't outlive the window.

## Optional: voice cloning

Voice cloning (LuxTTS + ZipVoice) is a heavy dependency stack
(~2 GB of ML wheels + a model download on first use), so the .dmg
ships only the source + an installer. To enable voice features:

```bash
bash "/Applications/Heirloom.app/Contents/Resources/tts/install-tts.sh"
```

The installer creates a venv at `~/Library/Application Support/Heirloom/tts/`
with the required wheels and a launcher script. Quit and relaunch
Heirloom - the shell auto-detects the sidecar and starts it next time.

Settings → Voice surfaces the same instruction when TTS is offline,
so end users don't have to dig through the bundle.

## Build the .dmg

```bash
bash desktop/scripts/package.sh
```

Requires:

- Rust toolchain (`rustup` stable)
- Node 22 on `PATH`
- `ollama` and `whisper-cli` on `PATH` (the script reads `which`)
- pnpm

Output:

```
desktop/src-tauri/target/release/bundle/dmg/Heirloom_0.2.0_aarch64.dmg
desktop/src-tauri/target/release/bundle/dmg/Heirloom.dmg     (same file, stable name)
desktop/src-tauri/target/release/bundle/macos/Heirloom.app
```

The script builds only the `.app` via Tauri, then assembles the DMG
with `hdiutil` (no Finder/AppleScript, so it works headless — Tauri's
built-in create-dmg step does not). The DMG is a plain drag-to-
`/Applications` layout.

## Signing + notarization (the 10-minute credential step)

The unsigned DMG runs after the right-click → Open Gatekeeper dance. To
ship a DMG that opens with a double-click, code-sign with a Developer ID
and notarize. Everything is prepared; this needs only an Apple Developer
account and an app-specific password.

Prerequisites (one time): an Apple Developer ID Application certificate
in the login keychain, and an app-specific password stored as a notary
profile:

```bash
xcrun notarytool store-credentials heirloom-notary \
  --apple-id "you@example.com" \
  --team-id "YOURTEAMID" \
  --password "app-specific-password"
```

Then, after `package.sh` produces the `.app`:

```bash
APP="desktop/src-tauri/target/release/bundle/macos/Heirloom.app"
IDENTITY="Developer ID Application: Your Name (YOURTEAMID)"

# 1. Sign inside-out (sidecars + dylibs first, then the app) with the
#    hardened runtime and Heirloom's entitlements. --deep is deprecated;
#    sign the nested Mach-O explicitly.
for bin in "$APP"/Contents/MacOS/* "$APP"/Contents/Resources/server/node_modules/**/*.node; do
  [ -f "$bin" ] && codesign --force --timestamp --options runtime \
    --entitlements desktop/src-tauri/entitlements.plist \
    --sign "$IDENTITY" "$bin" 2>/dev/null || true
done
codesign --force --timestamp --options runtime \
  --entitlements desktop/src-tauri/entitlements.plist \
  --sign "$IDENTITY" "$APP"

# 2. Re-run stage 6 of package.sh (or just re-hdiutil) to wrap the SIGNED
#    .app into the DMG, then notarize + staple the DMG.
xcrun notarytool submit \
  "desktop/src-tauri/target/release/bundle/dmg/Heirloom.dmg" \
  --keychain-profile heirloom-notary --wait
xcrun stapler staple \
  "desktop/src-tauri/target/release/bundle/dmg/Heirloom.dmg"
```

`entitlements.plist` grants exactly the hardened-runtime exceptions the
bundled sidecars need (JIT for Node, library-validation off so the
ad-hoc-signed whisper dylibs and the spawned Ollama/whisper binaries
load) and nothing more — see the comments in that file.

First-run model downloads happen inside the app: the splash screen
pulls `gemma4:e4b` and `embeddinggemma` through Ollama's REST API
with visible progress, into the app-data `OLLAMA_MODELS` dir. The
pull is resumable - quitting mid-download and reopening picks up
where it left off.

## Iterating on the shell

For day-to-day work the Tauri shell can attach to a `pnpm dev` server:

```bash
pnpm tauri:dev     # opens a native window pointed at http://localhost:3000
```

This skips the bundled Node + Ollama spawn path; the dev server you
already have running is the source of truth.

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
desktop/src-tauri/target/release/bundle/dmg/Heirloom.dmg     (~92 MB)
desktop/src-tauri/target/release/bundle/macos/Heirloom.app   (~214 MB)
```

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

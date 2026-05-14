# Heirloom — desktop bundle

Tauri-bundled macOS `.dmg` that runs the same Heirloom code as the
web app, but fully self-contained:

```
Heirloom.app
├── Contents/MacOS/
│   ├── heirloom         ← Tauri shell, supervises sidecars
│   ├── ollama           ← bundled Ollama (~36 MB)
│   ├── node             ← Node 22 runtime (~107 MB)
│   └── whisper-cli      ← whisper.cpp (~650 KB)
└── Contents/Resources/server/
    ├── server.js        ← Next.js standalone server
    ├── .next/           ← prod build assets
    ├── node_modules/    ← slim trace, includes better-sqlite3 + sqlite-vec
    ├── public/
    └── migrations/sqlite/001_schema.sql
```

On launch the shell:

1. Resolves a per-user app-data directory under
   `~/Library/Application Support/Heirloom/` (DB + blobs + Ollama
   model cache live here so uninstall = `rm -rf`).
2. Spawns Ollama on `127.0.0.1:11434` with `OLLAMA_MODELS` pointed at
   the app-data dir.
3. Spawns the bundled Node + Next.js server on `127.0.0.1:3000` with
   `HEIRLOOM_BACKEND=sqlite`.
4. Opens a WKWebView at the placeholder page, which polls
   `/api/health` and pivots to the portal once it answers.
5. On exit, SIGTERMs both children so they don't outlive the window.

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

The first-run user still needs to pull the models — the shell points
`OLLAMA_MODELS` at the app-data dir, so a one-shot
`ollama pull gemma4:e4b` from inside the app's terminal (or a future
in-app pull screen) populates the cache.

## Iterating on the shell

For day-to-day work the Tauri shell can attach to a `pnpm dev` server:

```bash
pnpm tauri:dev     # opens a native window pointed at http://localhost:3000
```

This skips the bundled Node + Ollama spawn path; the dev server you
already have running is the source of truth.

# ARCHITECTURE.md

System architecture for Heirloom as it ships.

![Heirloom system architecture diagram](../../docs/architecture.png)

The diagram above is the single-page reference. The sections below walk each band in detail.

---

## 1. Deployment shapes

Heirloom is **local-first by default** and runs in three deployment shapes from the same codebase. Pick the one whose privacy posture matches the situation.

### 1a. Laptop install (recommended)

The canonical path. `./install.sh` on the creator's Mac. Ollama, Postgres 16 + pgvector, whisper-cpp, ffmpeg, and pnpm all land via Homebrew; Gemma 4 e4b (~9.6 GB) and EmbeddingGemma (~621 MB) pull on first run; the Next.js app starts at `http://localhost:3000`. Nothing leaves the device.

```
┌─────────────────────────────────────────────────────────┐
│  Creator's Mac                                          │
│                                                         │
│   Browser / installed PWA                               │
│        │                                                │
│        ▼                                                │
│   Next.js 16 app (pnpm dev or pnpm start)               │
│   src/app/api/* route handlers                          │
│        │     │             │                            │
│        ▼     ▼             ▼                            │
│   Postgres  Ollama   whisper-cpp     [optional]         │
│   :5432     :11434   subprocess      TTS sidecar :11435 │
│   +pgvector gemma4:e4b              LuxTTS/ZipVoice     │
│             embeddinggemma                              │
│                                                         │
│   storage/blobs/<uuid>.<ext>   - audio/photo originals  │
└─────────────────────────────────────────────────────────┘
```

### 1b. Self-hosted Ubuntu VM

Same code, same architecture, on infrastructure the user owns. Any Ubuntu 22.04 host with ~8 vCPU / 32 GB RAM works; the example runbook in [`docs/DEPLOY-AZURE-VM.md`](../../docs/DEPLOY-AZURE-VM.md) uses Azure but `infra/vm-setup.sh` is provider-agnostic. Bootstrap is `infra/vm-setup.sh` + `infra/build-and-start.sh`. Caddy terminates TLS, reverse-proxies to the Next.js app at `:3000`. CPU inference is slow (Reflection ~27 s to first token vs ~3 s on a GPU laptop); acceptable for a small audience, not acceptable for a public launch. Multiple creators can share one host - each *Begin a new archive* mints an independent vault with its own creator passphrase, RLS-scoped per session.

### 1c. macOS .dmg desktop bundle

Tauri 2 shell at `desktop/src-tauri/`, packaged via `desktop/scripts/package.sh`. Bundles:

```
Heirloom.app
├── Contents/MacOS/
│   ├── heirloom         ← Tauri shell, supervises sidecars
│   ├── ollama           ← bundled Ollama (~36 MB)
│   ├── node             ← Node 22 runtime (~107 MB)
│   └── whisper-cli      ← whisper.cpp (~650 KB)
└── Contents/Resources/
    ├── server/          ← Next.js standalone server + better-sqlite3 + sqlite-vec
    │   ├── server.js
    │   ├── .next/
    │   ├── node_modules/
    │   ├── public/
    │   └── migrations/sqlite/001_schema.sql
    └── tts/             ← optional voice-cloning sidecar
        ├── server.py
        ├── requirements.txt
        └── install-tts.sh
```

On launch the Tauri shell:
1. Resolves `~/Library/Application Support/Heirloom/` for the SQLite DB + blob dir.
2. Spawns Ollama on `127.0.0.1:11434` with `OLLAMA_MODELS` pointed at the app-data dir.
3. If `<app_data>/tts/run.sh` exists (created by the user running `install-tts.sh`), spawns the TTS sidecar on `127.0.0.1:11435`. Otherwise voice features stay disabled and text/photo/retrieval all work unchanged.
4. Spawns the bundled Node + Next.js standalone server on `127.0.0.1:3000` with `HEIRLOOM_BACKEND=sqlite` and `HEIRLOOM_SQLITE_PATH` pointing at the per-user DB.
5. Opens a WKWebView, polls `/api/health`, and navigates to the portal when it answers.
6. On exit, SIGTERMs all children.

SQLite + sqlite-vec replaces Postgres + pgvector; RLS is dropped because the desktop build is single-user. The schema mirror lives at `migrations/sqlite/001_schema.sql` (UUIDs become TEXT, timestamps become ISO 8601 strings, vectors become Float32 LE blobs, ENUMs become CHECK constraints).

The TTS sidecar is **opt-in**: the .dmg ships only the source + `install-tts.sh`. Users who want voice features run `bash "/Applications/Heirloom.app/Contents/Resources/tts/install-tts.sh"` once, which creates a venv at `~/Library/Application Support/Heirloom/tts/` (~2 GB of ML wheels). Settings → Voice surfaces the same instruction when TTS is offline.

---

## 2. Component layout

```
┌────────────────────────────────────────────────────────────────┐
│  Next.js 16 (App Router, RSC)                                  │
│                                                                │
│   src/app/                                                     │
│   ├── page.tsx              ← role-aware home dispatcher       │
│   ├── portal/               ← entry point (begin / sealed)     │
│   ├── onboarding/           ← 5-step creator onboarding        │
│   │     name+selfie → voice → anchors → nominees → letters     │
│   ├── welcome/              ← nominee envelope + passphrase    │
│   ├── reflect/              ← Reflection room (creator + nominee)│
│   ├── settings/             ← Settings (you, dates, nominees,  │
│   │                            voice, notifications, vault)    │
│   ├── transparency/         ← Reflection diagnostics view      │
│   ├── executor/{setup,unlock}/                                 │
│   ├── album/[theme]/        ← themed album for nominees        │
│   ├── dev/                  ← role switcher + vault reset      │
│   └── api/                                                     │
│       ├── auth/nominee-passphrase  POST                        │
│       ├── capture                  POST + GET /[id]/status     │
│       ├── reflect                  POST (SSE)                  │
│       ├── transcribe               POST (mic-in-text-fields)   │
│       ├── voice/{clone,profile,speak}  POST/GET                │
│       ├── nominee/mood             POST (state trigger)        │
│       ├── nominees                 GET/POST + /[id]/passphrase │
│       ├── prompt/shuffle           GET                         │
│       ├── me/{home,profile,settings}  GET/PATCH                │
│       ├── life-events              GET/POST + /[id]            │
│       ├── onboarding/{self,life-events,nominees,seed-prompts,  │
│       │                seed-letters,complete,status}           │
│       ├── notifications/{subscribe,unsubscribe,test}           │
│       ├── cron/daily-memory        POST (X-Cron-Secret gated)  │
│       ├── vault/{export,import}    POST                        │
│       ├── executor/{setup,unlock}  POST                        │
│       ├── blob/[id]                GET (RLS-gated blob serving)│
│       ├── dev/{bootstrap,nominee,reset,sign-out}  POST         │
│       └── health                   GET                         │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. Why this stack

| Choice | Reason |
|---|---|
| Next.js 16 App Router | Single codebase deploys to web + installable PWA + Tauri shell. RSC is used for the role gate on `/` (`page.tsx` reads the session, dispatches to creator/nominee home). |
| Route handlers, not a separate backend | A single Node process is simpler to ship inside a `.app`. Per-request `withRls()` wraps every transaction with `SET LOCAL app.user_id / app.role` GUCs. |
| Postgres + pgvector | One DB for relational + vector. RLS is the cleanest enforcement of creator/nominee isolation. HNSW indexes on every 768-dim chunk embedding + every 128-dim face descriptor. |
| SQLite + sqlite-vec (desktop) | The .dmg can't ship Postgres. Schema is a 1:1 mirror with type substitutions; the backend dispatcher (`src/lib/db/index.ts`) selects at import time via `HEIRLOOM_BACKEND`. |
| Ollama | Hosts `gemma4:e4b` (text + vision) + `embeddinggemma` (768-dim) on the same `:11434` endpoint. Single binary; auto-detects CUDA when present. |
| Custom `heirloom/gemma4-grounded` Modelfile | Bakes the grounding contract into the system prompt - belt-and-suspenders alongside the prompt template in code. Built locally with `ollama create`. |
| Whisper-cpp small.en (subprocess) | Best open ASR that fits CPU. ~3 s for a 30 s clip on M-series, ~6 s on 8 vCPUs. Cold-load tax avoided via pre-warm at boot. |
| Gemma 4 vision for photo captions | Same `gemma4:e4b` via `/api/chat` with `images: [b64]`. When face-api.js clusters a face to a known person, the system prompt names them so the caption reads "Rita holding Sam" rather than "a woman holding a child". |
| LuxTTS/ZipVoice sidecar | Zero-shot voice cloning from a single 15-30 s reference. FastAPI wrapper at `127.0.0.1:11435` keeps it out-of-process so a heavy Python stack doesn't bloat the main app's memory footprint. |
| face-api.js (client-side) | Faces never leave the device. 128-dim descriptors are posted from the browser alongside the photo capture multipart payload. |
| JWT session cookie | 30-day HS256 token, `httpOnly`, `sameSite=lax`, `secure` in production. No magic-link, no email; sessions issue at portal-passphrase entry (nominee) or onboarding completion (creator). |
| Local blob storage | Audio/photo originals live under `storage/blobs/<uuid>.<ext>` on the laptop, `<app_data>/blobs/` on the desktop bundle, `/opt/heirloom/app/storage/blobs/` on the VM. `/api/blob/[id]` serves them with RLS-equivalent gating. |

---

## 4. Data flow - capture commit

```
1. User stops recording / picks a photo / saves a note →
   client POSTs to /api/capture
   - multipart/form-data with `file` + `metadata` (audio/photo/video)
   - application/json `{kind:'note', body, title?}` for notes
   - faces[] (128-dim descriptors from face-api.js) attached for photo
2. /api/capture writes the blob, inserts captures row (status='processing'),
   inserts face_appearances if any, returns {capture_id, status} 202.
   Returns IMMEDIATELY; the pipeline runs detached.
3. Detached pipeline (src/lib/pipeline.ts):
   a. audio → whisper-cpp transcribes; transcripts row written
   b. photo → Gemma 4 vision captions; captures.caption updated.
      Recognized faces (joined through people.display_name) seed the
      system prompt so the caption names them.
   c. note → captures.body is the text
   d. Chunk + EmbeddingGemma embed → transcript_chunks rows
   e. Auto-release to every nominee for this vault (unless this capture
      is the body of a sealed letter - those release through the
      condition engine instead)
   f. Mark status='ready' BEFORE the slow Gemma calls so the user sees
      "Saved" immediately
   g. In parallel: Gemma 4 e4b tagging (emotion/topic/person/place) and
      auto-title generation. Failures are best-effort.
4. The capture-sheet UI polls GET /api/capture/[id]/status (SSE) for
   stage labels (uploaded → transcribed → embedded → tagged → ready)
   and renders calm stage copy ("Listening for the words…").
```

---

## 5. Data flow - Reflection query

```
1. Nominee (or creator self-test) submits a question →
   client POSTs to /api/reflect (NOT EventSource - POST + SSE-reader)
   Body: {question}
2. /api/reflect:
   a. Embed the question with EmbeddingGemma
   b. If role=nominee: try to fire any sealed_letters whose semantic
      conditions match this question. Each fired letter emits a
      `sealed_letter` SSE event.
   c. pgvector top-5 over transcript_chunks (RLS already narrowed the
      visible set: released captures + the vault's profile capture).
      Emit `retrieved` with hit count + top similarity.
   d. If top similarity < REFLECTION_SIMILARITY_THRESHOLD (0.40): emit
      `grounded:{grounded:false}` + `answer` with the verbatim empty
      state + `done`. Reflection row persists with diagnostics for
      /transparency. Gemma is NEVER called.
   e. Otherwise: emit `grounded:{grounded:true}`, build the synthesis
      prompt (SAFETY_PREAMBLE + question + retrieved chunks + JSON
      output contract), stream via Vercel AI SDK's streamObject against
      the `heirloom/gemma4-grounded` Modelfile.
   f. As tokens arrive: emit `answer_partial` for prose extensions and
      `claim` for each claim whose citations all reference a retrieved
      capture_id (any fabricated UUID is dropped silently).
   g. After streamObject resolves: final citation validator + first-
      person scrubber + non-empty-claims check. Any failure collapses
      to the empty state + emits `grounded:{grounded:false}` + `done`
      with `rejected_for` in diagnostics.
   h. Persist reflections row (always; grounded false counts) with the
      retrieved-chunks snapshot for /transparency.
3. Tap a citation chip → drawer opens with the source snippet + a
   "Hear in their voice" SpeakButton (if voice profile + TTS available).
```

---

## 6. Role enforcement

Two roles: **creator** and **nominee**. The JWT carries `{user_id, vault_id, role}`. `vault_id` is the active vault context, not an immutable user attribute.

- A **creator** can read/write their own vault's captures, threads, nominees, life events, sealed letters, voice profile, push subscriptions, reflections.
- A **nominee** can read captures where there is a `nominee_releases` row with `released_at <= now()`, AND profile captures (`is_profile = true`) of any vault they're a nominee on (so retrieval can answer identity questions). They can write reflections (their own queries) and nominee_states (mood taps).
- The executor flow is a separate route (`/api/executor/unlock`) that, on correct argon2id passphrase match, atomically inserts `nominee_releases` rows for every capture in the vault to every nominee. There is no "executor role" in the JWT; executors don't enter the archive themselves.

Every authenticated request runs inside `withRls(user_id, role, fn)`, which BEGINs a transaction and runs `SET LOCAL app.user_id = ...; SET LOCAL app.role = ...` before calling `fn`. RLS policies on every table read those GUCs. The full policy set lives in `SCHEMA.sql` + `migrations/001_complete_rls_policies.sql` + `migrations/006_identity_index.sql`.

---

## 7. Identity index

A hidden "profile" capture per vault carries biographical facts (creator name, life events, nominees, sealed-letter occasions) so Reflection retrieval can answer identity queries - *"who is X?"*, *"when were you born?"* - without the creator having to write those facts as a real note. See `src/lib/identity-index.ts` and migration `006_identity_index.sql`.

- The capture sits in `captures` with `is_profile = true` so chunking + embedding + RLS machinery is reused.
- `is_profile = true` hides it from timeline / album / home queries (`WHERE is_profile = false` in `/api/me/home`).
- The nominee RLS policies for `captures` and `transcript_chunks` have an explicit alternative path: profile captures of any vault the user is a nominee on are readable without a `nominee_releases` row.
- The prose is templated from row data (`renderIdentityProse` in `identity-index.ts`) and re-synced after every onboarding/settings write that could change the facts:
  - `/api/onboarding/{self,life-events,nominees,seed-letters,complete}`
  - `/api/me/profile` (display name)
  - `/api/life-events` (add)
  - `/api/life-events/[id]` (delete)
  - `desktop/scripts/import-seed-archive.ts` (seed import)
- Each resync deletes the existing profile capture and inserts a fresh one with new chunks + embeddings. Idempotent and cheap; failures are logged but never block the user's primary save.

---

## 8. Sealed letters with conditional unlock

Sealed letters extend the capture model. Each row in `sealed_letters` references a capture (the letter body), the destination nominee, an `occasion_prompt` (the headline the recipient sees), an `intent_embedding` (the occasion embedded so it can be semantic-matched), and a `conditions` JSON DSL:

```jsonc
{ "any_of": [
    { "kind": "date",           "date": "2030-04-12" },
    { "kind": "life_event",     "event_kind": "wedding" },
    { "kind": "calendar",       "rule": "anniversary_of_loss" },
    { "kind": "state",          "state": "struggling" },
    { "kind": "semantic_match", "threshold": 0.55, "topic": "feeling lost" },
    { "kind": "first_visit" }
]}
```

`fireLetterConditions(session, ctx)` (in `src/lib/letter-conditions.ts`) is called from three places:
- Every load of `GET /api/me/home` for a nominee (trigger_kind=`calendar` - covers `date`, `life_event`, `first_visit`).
- `POST /api/nominee/mood` when a nominee taps a mood chip (trigger_kind=`state` with embedding).
- `POST /api/reflect` for every nominee question (trigger_kind=`semantic` with the question's embedding) - so a sealed letter can fire before any grounded answer streams.
- `POST /api/cron/daily-memory` (cron-secret gated) for scheduled date triggers.

Each fired letter inserts a `nominee_releases` row, so RLS naturally surfaces the underlying capture downstream. The home payload distinguishes `newly_fired_letters` (this load only) from the rest of `released_captures` and renders them as the gold-bordered "sealed for you" card.

---

## 9. Voice cloning sidecar

The TTS sidecar (`infra/tts-server/`) is a thin FastAPI wrapper around LuxTTS/ZipVoice (zero-shot voice cloning) running at `127.0.0.1:11435`.

Endpoints:
- `POST /encode` - multipart `audio` (wav) → caches the reference + returns `{voice_id, duration_seconds, sample_rate}`.
- `POST /speak` - `{voice_id, text}` → streams `audio/wav`.
- `GET /healthz` - `{ok, device, loaded, voices_cached}`.

Heirloom client lives in `src/lib/tts.ts`. Routes:
- `POST /api/voice/clone` (creator only) - registers a reference wav with the sidecar, persists the resulting `voice_id` on the single `voice_profiles` row per vault (`UNIQUE(vault_id)`).
- `GET /api/voice/profile` - returns whether this vault has a profile + whether TTS is reachable. The `SpeakButton` component hits this on mount and hides itself unless both are true.
- `POST /api/voice/speak` - takes `{text}`, looks up the vault's `voice_id` (creator via RLS, nominee via admin connection narrowed to `session.vault_id`), streams audio/wav back.

**Verbatim-only contract:** the server doesn't enforce per-character verbatim (too brittle); the UI never exposes a "speak this" affordance over Gemma-synthesized text. `SpeakButton` is only mounted on capture bodies, transcript snippets, sealed-letter bodies, and Reflection citation snippets - the exact source material. The Reflection page's main answer prose never gets a SpeakButton. See `hasFirstPersonOutsideQuotes` in `src/lib/reflection.ts` for the rejector that would block first-person prose at the answer-text layer.

First synthesis pays a ~25 s model-load cost; subsequent requests are ~3× realtime on Apple Silicon (MPS), ~1× realtime on 8 CPU cores. The model weights are ~1 GB resident + ~300 MB Python runtime.

---

## 10. Encrypted vault export / import

`POST /api/vault/export` produces a single passphrase-encrypted `.hloom` file containing every row + every audio/photo blob:

- **KDF:** argon2id, m=64 MiB, t=3, p=4, 32-byte key
- **AEAD:** ChaCha20-Poly1305 with 12-byte nonce, 16-byte tag
- **AAD:** `heirloom/v1/<vault_id>`
- **Payload:** gzip-compressed JSON envelope of `{manifest, rows, blobs}` where `blobs` is `{<blob_url>: <base64>}`
- **Wire format:** JSON envelope with `{magic:"HLOOM", version:1, kdf, cipher, ciphertext, tag, meta}` - self-describing so a future version can be detected

`POST /api/vault/import` reverses the process (settings → Vault → "Import a bundle"). Currently nukes the importing user's vault and replaces it wholesale; cross-vault id remapping is rebuilt with `randomBytes` blob filenames so imports don't collide with existing storage.

See `src/lib/vault-export.ts` for the implementation.

---

## 11. Observability

- **Structured-ish logs** to stdout. Console output is the only sink in v1; production self-hosters wrap with `journalctl`.
- **No PII in logs.** Capture text, transcripts, Reflection questions/answers/citations, letter bodies, passphrases, emails, display names - none of these are logged. Only `capture_id`, `vault_id`, `reflection_id`, `letter_id` are safe.
- **Diagnostics in the DB.** Every Reflection row stores `answer_json.diagnostics` with retrieval counts, top similarity, threshold, rejection reason, and the top-8 chunks (capture_id + similarity + 160-char snippet). The `/transparency` page surfaces this for the active user.
- **No telemetry.** The only outbound HTTPS the running app makes is Caddy → Let's Encrypt (cert renewal) and Ollama → ollama.com (first model pull). Heirloom itself phones nowhere.

---

## 12. Backup & recovery

Two things matter on a server install:
1. The `heirloom` Postgres database.
2. The `storage/blobs/` directory.

A nightly `pg_dump | zstd` + `tar` of the blob dir is enough; rsync to wherever the user trusts.

Better: in-app `.hloom` export. The bundle is provider-independent and imports cleanly into any fresh Heirloom instance.

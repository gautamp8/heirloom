# MILESTONES.md

What's shipped, what's deferred, what's deliberately out of scope.

This used to be a build plan; it's now a status doc. The order roughly follows the dependency graph (database → capture → home → Reflection → polish).

---

## Phase 0 - Local dev environment - **shipped**

`./install.sh` brings up a working laptop dev environment on macOS:
- Homebrew prerequisites
- Postgres 16 + pgvector
- Ollama with `gemma4:e4b` + `embeddinggemma`
- whisper-cpp + small.en model + ffmpeg
- pnpm install + migrations applied + `heirloom/gemma4-grounded` Modelfile built
- `.env.local` written with `JWT_SECRET`, `DATABASE_URL`, model env vars

`pnpm dev` starts the Next.js dev server at `localhost:3000`. `pnpm build && node .next/standalone/server.js` is the production-mode equivalent (also the path the desktop bundle takes).

Health check: `GET /api/health` returns `{ok, postgres, ollama:{status, version, models, synthesisAvailable, embeddingAvailable}}`.

---

## Phase 1 - Capture pipeline - **shipped**

End-to-end voice capture works: record → upload → Whisper → embed → tag → home shows it.

Surfaces:
- `POST /api/capture` handles audio (multipart), photo (multipart, with face descriptors), note (JSON).
- Pipeline detached after the 202 response (`runCapturePipeline`); failures move the row to `status='failed'` but never throw to the caller.
- Pipeline order is deliberate: status flips to `ready` BEFORE the slow Gemma calls so the user sees "Saved" within 1-2 s; tags + auto-title fill in on the next home load.
- `GET /api/capture/[id]/status` (SSE) streams stage labels back to the capture sheet.
- IndexedDB note drafts via `src/lib/drafts.ts`.

Capture modes in the UI: voice, note, photo. Video is rendered disabled in the chip grid; the API and pipeline can handle it but no sheet exposes it.

---

## Phase 2 - Creator home + multi-modal capture - **shipped**

- `GET /api/me/home` returns the role-aware payload (`creator` branch).
- Async `GET /api/prompt/shuffle` fetches a Gemma-generated prompt-of-day without blocking the home render.
- Photo capture: face-api.js client-side, recognized people seed the Gemma 4 vision system prompt.
- Note capture with VoiceInput mic-icon dictation in the title + body fields.

Recent captures list shows up to 12 rows; each renders the small SpeakButton "Their voice" pill when a voice profile + TTS sidecar are both available.

---

## Phase 3 - Reflection + grounding contract - **shipped**

`POST /api/reflect` is the central retrieval surface:
- EmbeddingGemma question embedding
- pgvector top-5 over RLS-narrowed `transcript_chunks`
- Hard threshold gate at `REFLECTION_SIMILARITY_THRESHOLD = 0.40`
- Sealed-letter semantic-match firing happens before the gate (`POST /api/reflect` fires `fireLetterConditions({trigger_kind:'semantic'})` before retrieval) so a question can unlock a letter even when no grounded answer exists
- `streamObject` against the `ReflectionSchema` Zod schema
- Per-claim citation filter during streaming
- Final citation validator + `hasFirstPersonOutsideQuotes` + non-empty-claims after streaming
- Every reflection (grounded or not) persists with diagnostics for `/transparency`

The `room.tsx` client consumes the SSE stream via POST + fetch-reader (EventSource doesn't support POST). Streaming UI shows calm progress copy and pulsing skeleton lines until the first `answer_partial` arrives.

Suggested prompts are archive-tailored: Sagan / Rogers / Gandhi each have hand-tuned prompts in `src/app/reflect/page.tsx` (`ARCHIVE_PROMPTS`). Default fallback for unknown creators is the three "tell me about your grandmother / father / wedding" prompts.

---

## Phase 4 - Nominee surfaces - **shipped**

- `/welcome` envelope + passphrase + animated unfold
- `POST /api/auth/nominee-passphrase` argon2-verifies and issues the session cookie
- Nominee home (`src/app/_components/nominee-home.tsx`) with:
  - Framing strip pulled from the per-nominee `letter_body`
  - Newly-fired letter cards (`fireLetterConditions({trigger_kind:'calendar'})` runs at the top of the home payload so first_visit / date / life_event letters surface on the same load)
  - Deterministic daily-memory hero
  - MoodCard (archive-tailored chips per known seed, fallback chips otherwise; chips that don't fire a sealed letter pivot to `/reflect?q=`)
  - Themed albums (topic-tag clusters with ≥ 2 captures)
  - Earlier-pieces list
  - Floating Reflection pill

---

## Phase 5 - Executor + onboarding seeded archives - **shipped**

- 5-step creator onboarding (welcome → voice → anchors → nominees → letters) at `/onboarding`
- Voice-clone reference recording during onboarding (skippable)
- Gemma-generated seed-letter occasion prompts (`/api/onboarding/seed-prompts`)
- Per-nominee passphrases displayed once on the letters step
- `POST /api/executor/setup` + `POST /api/executor/unlock` with argon2id hashing + rate limit

---

## Phase 6 - Voice cloning - **shipped**

- LuxTTS/ZipVoice FastAPI sidecar at `infra/tts-server/server.py`, runs at `127.0.0.1:11435`
- Endpoints: `POST /encode`, `POST /speak`, `GET /healthz`
- Heirloom client `src/lib/tts.ts`; routes `/api/voice/clone`, `/api/voice/profile`, `/api/voice/speak`
- `voice_profiles` table (migration `005`) with one row per vault
- `<SpeakButton>` component (`big` + `small` variants) self-hides when no profile or TTS unreachable
- Verbatim-only contract enforced at the call sites (see GUARDRAILS.md §11)
- Settings → Voice section with full record-replace flow + the "Play a sample" affordance

The TTS sidecar is **optional**. On the laptop install the user runs `pnpm tsx infra/tts-server/server.py` themselves; on the desktop bundle the .dmg ships `install-tts.sh` as a one-shot installer.

---

## Phase 7 - Identity index + archive-aware retrieval - **shipped**

- Hidden "profile" capture per vault carrying biographical facts (creator name, life events, nominees, sealed-letter occasions). Migration `006_identity_index.sql` adds `is_profile` to `captures` and an alternative RLS path so nominees can read profile chunks without a release row.
- `renderIdentityProse` templates the row data into searchable text; `syncIdentityIndexAdmin` / `syncIdentityIndexForSession` rebuild the profile capture + chunks. Called after every relevant onboarding / settings write.
- Reflection retrieval now reliably answers identity queries ("who is X?", "when were you born?", "who are the nominees?") without the creator having to write those facts as a real note.

---

## Phase 8 - Seed archives - **shipped**

- Carl Sagan seed archive at `desktop/seed-archives/sagan/` (manifest + 4 notes + 3 photos + 1 sealed letter + framing letter)
- Importer at `desktop/scripts/import-seed-archive.ts` - usable for any `manifest.json` following the same shape
- Pattern: archive folder contains `manifest.json` + `audio/reference.wav` (voice reference) + `photos/*.jpg` + optional `text/*` source files
- Passphrase convention: `<slug(creator name)> archive · 1990` (e.g. `carl-sagan archive · 1990`)
- Voice references in `desktop/seed-archives/*/audio/reference.wav` are placeholders (estate-controlled clips can't redistribute); the importer registers them anyway, the user replaces with a real recording for authenticity. Flagged via `voice_reference_is_placeholder: true` in `manifest.json`.

---

## Phase 9 - PWA notifications (Web Push) - **shipped**

- `manifest.webmanifest` + apple-touch-icon + service worker at `public/sw.js`
- VAPID-keyed Web Push for two channels: sealed-letter unlocks and daily memory
- `push_subscriptions` table (migration `004`)
- Settings → Notifications subscribe / unsubscribe / send-test
- `POST /api/cron/daily-memory` (gated by `X-Cron-Secret`) for the daily tick
- iOS PWA install required for push; Settings surfaces the instruction when unsupported

---

## Phase 10 - Encrypted vault export / import - **shipped**

- `POST /api/vault/export` produces a single passphrase-encrypted `.hloom` bundle (argon2id + ChaCha20-Poly1305 + gzipped JSON envelope with every row + every blob)
- `POST /api/vault/import` decrypts + replaces the importing user's vault (settings → Vault → Import)
- Wire format documented in ARCHITECTURE.md §10 and `src/lib/vault-export.ts`

---

## Phase 11 - Desktop bundle (macOS .dmg) - **shipped**

- Tauri 2 shell at `desktop/src-tauri/`, package script `desktop/scripts/package.sh`
- Bundles Ollama (~36 MB), Node 22 (~107 MB), whisper-cli (~650 KB) as sidecars
- SQLite + sqlite-vec replaces Postgres + pgvector (migration mirror at `migrations/sqlite/001_schema.sql`)
- Backend dispatcher (`src/lib/db/index.ts`) selects backend at import time via `HEIRLOOM_BACKEND`
- TTS sidecar is opt-in (ships `install-tts.sh`, not the wheels)
- Shell spawns Ollama + optional TTS + Node server, polls `/api/health`, navigates the WKWebView when ready

Output: `Heirloom.dmg` ~92 MB / `Heirloom.app` ~214 MB.

---

## Phase 12 - Self-hosted Ubuntu VM deployment - **shipped**

`docs/DEPLOY-AZURE-VM.md` is the example runbook (provider-agnostic; Azure happens to be where ours runs). `infra/vm-setup.sh` + `infra/build-and-start.sh` bootstrap any Ubuntu 22.04 host:
- Postgres 16 + pgvector
- Ollama (CPU-only systemd unit; no GPU drivers)
- whisper-cpp from source
- Node 22 + pnpm 10
- Caddy with Let's Encrypt
- A `heirloom` systemd unit
- Pre-warm at boot (`ollama-warmup.service`)

Tradeoff matrix on CPU vs GPU latencies is in the runbook (CPU is ~10-20× slower than M-series; acceptable for a small audience, not a public launch).

Multiple creators can share one host. Each *Begin a new archive* mints an independent vault with its own creator passphrase; sessions are RLS-scoped via `app.user_id`.

---

## What's deferred

- **In-app account deletion.** Designed (7-day soft delete + confirmation phrase) but not built.
- **Threads.** Tables + RLS policies exist; no UI surfaces them. The recent-captures feed alone is fine for v1.
- **Preview-as-nominee.** Designed in APP.md; not built. The `/dev` page covers the developer's use case.
- **Saved passages.** `saved_passages` table exists; no UI surfaces them.
- **Real signup / account recovery.** Multi-vault on one host works through per-creator passphrases, but there is no email-bound signup, no MFA, no "forgot your passphrase" flow. Lose the passphrase, lose the vault. Native mobile apps + cloud-key-escrow would change this.
- **Background-sync queue for offline captures.** Drafts table is notes-only.
- **Video capture UI.** Chip is rendered disabled; the rest of the stack handles `kind='video'`.
- **Lighthouse CI / a11y CI.** Manual checks only.
- **Magic-link auth.** Cookie-bound JWT issued at portal-passphrase entry covers v1. No email is sent anywhere in the app.

## What's deliberately out of scope

- AI bot avatars, sparkles, orbs, neon, gradients on AI surfaces
- Engagement loops: streaks, badges, "you have 3 unread memories"
- Social: comments, reactions, sharing to external platforms
- Notifications that personify the creator
- Animated avatars of the creator
- "Memorial" framing in any default copy
- ChatGPT chrome on Reflection
- Cross-tenant SaaS hosting (the privacy story doesn't survive multi-tenant)

---

## CI / CD

GitHub Actions: lint + typecheck on every PR. There is no guardrail-test CI suite yet - the grounding tests, prompt-injection tests, and RLS tests described in `PROMPT_INJECTION_TESTS.md` and `GUARDRAILS.md` are tracked as known gaps.

Migrations: plain SQL files in `migrations/*.sql`. The bootstrap scripts apply every file under `migrations/` and `design-system/handoff/SCHEMA.sql` (idempotent; safe to re-run). No migration framework; new migrations go in numerically.

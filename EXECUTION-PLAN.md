# EXECUTION-PLAN.md

Agent-paced execution plan for Heirloom v1. The unit of work is the **phase**; each phase has a deliverable, acceptance criteria, and a list of parallelizable sub-tasks.

The architecture-anchored milestone view lives in `design-system/handoff/MILESTONES.md`. This file is the doing-view: what an AI agent can pick up and execute today, in order, with the right work running in parallel.

> **Scope discipline.** v1 ships the smallest honest version of Heirloom that proves the architecture: grounded retrieval, citation chips, sealed-letter handoff, executor unlock. Photo / video capture, threads, voice-clone consent, notifications, and account deletion are designed but not built. See `design-system/DESIGN-v1.md §1`.

---

## Preflight (one-time local setup)

v1 runs end-to-end on the development laptop. Apple Silicon with ≥ 32 GB unified memory and ≥ 20 GB free disk runs the full stack — synthesis, embedding, retrieval, transcription — without a remote inference host. No GPU quota, no VM, no DNS.

| # | Task | Status | Notes |
|---|---|---|---|
| P1 | Install Ollama | ✓ done | `brew install ollama`, daemon running with `OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0` |
| P2 | Pull `embeddinggemma` (621 MB) | ✓ done | 768-dim output, verified |
| P3 | Pull `gemma4:e4b` (9.6 GB) | ✓ done | ~51 tok/s warm on M4 Pro 48 GB; third-person grounding behaviour verified |
| P4 | Install Whisper for transcription | pending | `brew install whisper-cpp` or `pip install openai-whisper`; pull `ggml-large-v3` weights |
| P5 | Postgres 16 + pgvector | pending | Local Docker (`postgres:16` with `pgvector/pgvector:pg16` image) or Postgres.app; create `heirloom_app` role and empty `heirloom` database |
| P6 | (Optional) Cloudflare Tunnel or Tailscale Funnel | post-build | If a public URL is needed, tunnel `localhost:3000` from the laptop. Not required for development; required for a sharable demo URL. |

Verification before Phase A: `curl http://localhost:11434/api/version` returns Ollama's version, `psql -d heirloom -c 'SELECT 1'` returns one row, `whisper-cli --help` runs. All three local, no auth.

### Optional: scale-up paths if needed later

- **Better synthesis:** `ollama pull gemma4:26b` (16.75 GB) — needs ~10 GB more disk freed first. Reflection synthesis becomes richer at ~12 tok/s.
- **Public live URL:** Cloudflare Tunnel is the cleanest path. Free, persistent, points `heirloom.<your-domain>` at `localhost:3000`. No ngrok rate limits.

---

## Phase A — Scaffolding (parallel)

**Goal:** Next.js boots locally with the design tokens applied. Local Postgres + pgvector is up. A single `/api/health` route confirms Ollama and Postgres reachable. CI runs lint + typecheck + test green.

**Stack:** one Next.js process. Route handlers under `app/api/*` do everything: Ollama via the `ollama-ai-provider` AI SDK plugin, Postgres via `postgres.js`, Whisper via a `child_process` call to `whisper-cli`. No separate backend.

**Parallelizable sub-tasks:**

- **A1 · Next.js scaffold.** `npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"` at the repo root. Install `ai`, `ollama-ai-provider`, `postgres`, `argon2`, `jose`, `framer-motion`, `next-pwa`, `dexie`, `zod`.
- **A2 · Token preset.** Lift CSS variables from `design-system/Heirloom Design System.html` into `src/app/globals.css` and configure Tailwind v4 `@theme` block. Verify warm-paper palette, type ramp, radii, spacing tokens, motion tokens — the design system HTML is the source of truth.
- **A3 · Font self-hosting.** Drop Newsreader, Geist, JetBrains Mono as `.woff2` into `public/fonts/`. Register via `next/font/local`. No CDN font loads.
- **A4 · Local Postgres.** `docker-compose.yaml` at repo root running `pgvector/pgvector:pg16`. Apply `design-system/handoff/SCHEMA.sql`. Verify pgvector extension and HNSW index with `\dx` and `\di`. Create the `heirloom_app` role.
- **A5 · Lib glue.**
  - `src/lib/db.ts` — `postgres.js` client. Per-request transaction wrapper that sets `app.user_id` and `app.role` GUCs (so RLS gates apply).
  - `src/lib/ollama.ts` — `ollama-ai-provider` configured with `baseURL: http://localhost:11434` and two model handles: `gemma4` for synthesis and `embeddinggemma` for vectors.
  - `src/lib/auth.ts` — JWT verify (using `jose`) returning `{ user_id, role, vault_id }`.
- **A6 · `/api/health` route.** Hits Ollama `/api/version` and runs `SELECT 1` against Postgres. Returns `{ ollama: 'ok', postgres: 'ok', models: [...] }`.
- **A7 · CI workflow.** `.github/workflows/ci.yaml` runs `pnpm lint`, `pnpm typecheck`, `pnpm test`. PR-gated. A failing guardrail test blocks merge.

**Acceptance:**
- `pnpm dev` starts the app at `localhost:3000`
- `curl http://localhost:3000/api/health` returns `{ ollama: 'ok', postgres: 'ok' }` with both models listed
- Home renders a single full-bleed `--bone` page with the Newsreader display token applied
- CI green on a placeholder PR

---

## Phase B — Capture commit pipeline

**Goal:** Audio capture works end-to-end. A 30-second recording → Whisper transcript → EmbeddingGemma chunks → Gemma 4 tags → home shows the new capture, all within 15 seconds.

**Storage decision for v1:** audio blobs are written to `./storage/` on the local filesystem (gitignored). The schema's `blob_url` becomes a relative path. Object-storage abstraction (S3-compatible) is preserved behind a single `lib/storage.ts` interface so v2 can swap it without touching call-sites.

**Sub-tasks:**

- **B1 · `POST /api/capture` route handler.** Multipart form (audio) or JSON (note). Write blob to `./storage/`, insert a `captures` row with `status='processing'`, return `{ capture_id, status }`. Spawn the background pipeline (B2) as a `waitUntil`-style after-response continuation.
- **B2 · Background pipeline.** Whisper transcribes via `whisper-cli` subprocess → insert `transcripts` → chunk transcript at 512 tokens (64-token overlap) → embed each chunk with `embed({ model: ollama.embedding('embeddinggemma'), values: [...] })` → insert `transcript_chunks` → run `capture_tagging_v1` against `gemma4:e4b` using `generateObject` for JSON schema enforcement → insert `capture_tags` → set `captures.status='ready'`.
- **B3 · `GET /api/capture/[id]/status` stream.** Use the Web Streams API to send Server-Sent Events: `uploaded` → `transcribed` → `embedded` → `tagged` → `ready`. The handler polls the `captures` row state and emits on transition. Final event includes the full capture payload.
- **B4 · Capture sheet (voice).** Port `Creator Onboarding.html` step 5. MediaRecorder, live waveform via canvas, streaming transcript pane, wax-colored record button.
- **B5 · IndexedDB drafts.** Dexie DB for in-flight captures. The audio blob is written to IndexedDB *before* network upload begins, so a connection drop preserves the recording.
- **B6 · Post-capture review.** Render streamed tags as removable chips. Render the gentle follow-up question from `followup_question_v1` (a `generateText` call on `gemma4:e4b`). Two equal-weight buttons: `Save and rest` / `Record one more`.
- **B7 · Creator home (minimal).** Render greeting block, prompt-of-day card, capture chip grid (voice + note enabled), and the recent-captures feed via `GET /api/me/home`.

**Acceptance:**
- A real 30s audio recording from the phone browser commits, transcribes, tags, and appears on the creator home within 15 seconds (excluding Whisper cold load)
- The capture survives a forced page reload mid-upload (IndexedDB queue resumes)
- Tags render as wax-colored pill chips; removing a tag PATCHes the capture

---

## Phase C — Reflection (the load-bearing surface)

**Goal:** A nominee types a question, retrieval runs, and either the empty-state copy or a streaming, fully-cited answer appears. No first-person impersonation. No ungrounded synthesis. Ever.

**Sub-tasks:**

- **C1 · Embedding helper.** `embedQuery(text): Promise<number[]>` in `lib/embed.ts` wrapping `embed({ model: ollama.embedding('embeddinggemma'), value: text })`.
- **C2 · Retrieval helper.** `fetchTopK(qEmb, vaultId, k=8)` in `lib/retrieval.ts` runs `SELECT capture_id, text, 1 - (embedding <=> $1::vector) AS similarity FROM transcript_chunks WHERE vault_id = $2 ORDER BY embedding <=> $1::vector LIMIT $3`.
- **C3 · The grounding gate.** Single constant `REFLECTION_SIMILARITY_THRESHOLD = 0.55` in `lib/reflection.ts`. `if (!chunks.length || chunks[0].similarity < THRESHOLD) return EMPTY_STATE_RESPONSE`. Do not branch around it. The test `empty-state-on-low-similarity` must be green before C4 begins.
- **C4 · Synthesis call.** Pass top-k chunks to `gemma4:e4b` via `streamObject({ model, schema: ReflectionSchema, prompt: buildReflectionPrompt(question, chunks) })`. The Zod schema enforces shape; AI SDK validates each streamed partial.
- **C5 · Citation validator.** For every `claims[*].citations[*]`, assert the UUID is in the retrieved set. On mismatch, log a `validator_rejection` event (no PII) and serve the empty state.
- **C6 · First-person scrubber.** `hasFirstPersonOutsideQuotes(answer)` → if true, log `first_person_violation` and serve the empty state.
- **C7 · `POST /api/reflect` route.** Returns a `Response` whose body is the AI SDK's `toTextStreamResponse()` after C5+C6 wrap-around. Frontend reads it as SSE-shaped events: `retrieved`, `grounded`, `claim`, `done`.
- **C8 · Reflection sheet (frontend).** Port `Nominee Reveal.html` step 5. Use AI SDK's `useObject({ schema })` React hook to consume the streamed `claims` array. Citation chips render as monospaced superscripts. Tap a chip → citation drawer slides up with the original capture + audio scrubber jumped to the cited timestamp.
- **C9 · Guardrail tests.** Implement all seven non-negotiables from `GUARDRAILS.md §1` in `tests/guardrails/` using Vitest. Implement the prompt-injection harness from `PROMPT_INJECTION_TESTS.md`. CI runs them on every PR.

**Acceptance:**
- All seven guardrail tests pass
- The prompt-injection harness (all categories) passes
- A grounded query returns its first streaming claim in < 3s (warm models)
- An ungrounded query returns the empty state in < 200ms (no model call)

---

## Phase D — Nominee handoff (the ceremonial surface)

**Goal:** Nominee onboarding works. Sealed envelope, passphrase entry, seal-break animation, letter unfolds, cinematic intro, nominee home.

**Sub-tasks:**

- **D1 · Magic-link auth (local-dev shortcut).** `POST /api/auth/magic-link` generates a short-lived JWT-signed token and writes the verification link to the server console (no SMTP in v1). `POST /api/auth/verify` exchanges the token for a session JWT scoped to the right `vault_id` and `role`. v2 wires real email.
- **D2 · Nominee onboarding flow.** Port `Nominee Reveal.html`. Envelope screen → passphrase input → seal-break CSS keyframe animation → letter unfolds → cinematic intro → nominee home.
- **D3 · Nominee home.** Framing strip ("From <creator name>") + latest-unlocked hero + sealed pieces + saved passages section + floating Reflection pill.
- **D4 · Creator-side nominee assignment UI.** Nominees list, add nominee, set relationship + email, assign captures (all / curated / except), set release condition (anytime / scheduled / executor).
- **D5 · `POST /api/executor/setup`.** Generate a passphrase (four-word + 2-digit suffix), Argon2id-hash via the `argon2` Node binding, store in `executor_credentials`. Return the plaintext passphrase **once** in the HTTP response body, never again. Render it as a printable letter the creator can hand off out-of-band.
- **D6 · `POST /api/executor/unlock`.** Verify the passphrase, atomically flip every `nominee_releases` row for this vault from `released_at IS NULL` to `released_at = now()`. Rate-limited via an in-memory token bucket: 5 attempts / IP / hour, 10 lifetime per credential.

**Acceptance:**
- The seal-break animation completes cleanly on real iOS Safari (`test_seal_animation_completes` regression test passes)
- An end-to-end executor flow works: creator generates passphrase → executor enters it from a separate browser → every assigned capture flips to released → nominee can see them
- Wrong passphrase shakes the input; no visible failure counter
- Rate limit blocks the 6th attempt within an hour with a 429 response

---

## Phase E — Polish, PWA, seed data

**Goal:** The app is installable, offline-aware, and contains a real archive worth retrieving against.

**Sub-tasks (parallelizable):**

- **E1 · PWA manifest + service worker.** `next-pwa` with the runtime strategies in `PWA.md §2`. Background Sync queue for offline `POST /capture`.
- **E2 · Empty states.** All canonical empty states from `FLOWS.md §16`.
- **E3 · Settings.** Minimal v1: account info, change passphrase, sign out, about. Account deletion is designed but stubbed.
- **E4 · Verify-offline button.** Settings → About → "Verify offline" that disables network and confirms the home, latest released captures, and the cinematic intro all render from cache.
- **E5 · Seed archive.** Record ~25 real-voice captures across kinds and topics. Run them through the capture pipeline so transcripts, embeddings, and tags are real. Mix grounded topics (covered by captures) and explicitly-uncovered topics so the empty-state path is reachable from realistic questions.
- **E6 · A11y + performance pass.** Focus order, ARIA labels, color contrast on the wax/oxblood actions, hit areas ≥ 44px. Lighthouse target: PWA ≥ 95, A11y ≥ 95, Performance ≥ 90.

**Acceptance:**
- App installs on a real iPhone via Safari → Share → Add to Home Screen, launches in standalone mode
- After a forced offline toggle, the home renders, released captures play, the verify-offline path completes
- Seed archive exists; every grounded test question from the prompt-injection suite has at least one expected matched capture in the seed

---

## Phase F — Final verification

**Goal:** Everything that should work, works. Nothing has regressed.

**Sub-tasks:**

- **F1 · Full guardrail + injection suite re-run on staging.** No skipped tests. No `xfail`. No `.skip`.
- **F2 · Manual run-through of the product narrative on real hardware.** Two devices (creator's phone, nominee's phone). Real recording, real release, real nominee unlock, real Reflection query.
- **F3 · One polish change.** At most. Resist the urge to re-cut the cover assets or add features.
- **F4 · Public URL (optional).** If sharing publicly, expose `localhost:3000` via Cloudflare Tunnel or Tailscale Funnel. The tunnel survives laptop reboots; the inference host *is* the laptop, so the tunnel target stays stable.

**Acceptance:**
- Every test passes on `main`
- The product narrative works end-to-end on real devices
- The fallback walkthrough is deployed and reachable

---

## Parallelization map (for a multi-agent run)

If multiple agents are running concurrently, this is the safe parallelization:

```
Phase A:  A1 → A5                       ← scaffold first, then lib glue depends on it
          A2  A3  A4  A6  A7            ← parallel with A5
Phase B:  B1 → B2 → B3                  ← sequential (data flow)
          B4  B5  B6  B7                ← parallel with the route work
Phase C:  C1 → C2 → C3 → C4 → C5 → C6 → C7   ← grounding pipeline is sequential
          C8                            ← parallel with route work
          C9                            ← starts when C3 lands
Phase D:  D1  D5 → D6                   ← auth + executor parallel
          D2  D3  D4                    ← frontend parallel
Phase E:  E1  E2  E3  E4  E5  E6        ← all parallel
Phase F:  F1 → F2 → F3 → F4             ← sequential, careful
```

The grounding pipeline (C1→C7) is the single biggest serialization point. Everything else can fan out.

---

## Cut-list if any phase overruns

In priority order, cut from the bottom of v1 scope:

1. **Account deletion** — design only, stub the route
2. **Threads** — recent-captures feed alone is enough
3. **Preview-as-nominee** — design only, no code path
4. **Saved passages** — design only
5. **Notifications** — design only
6. **Photo / video capture** — voice + note carry the product narrative

Never cut: capture commit, Reflection, seal-break, executor unlock. Those four are the load-bearing surfaces.

---

## What "done" looks like

- The product narrative in `design-system/handoff/README.md` plays back end-to-end on real devices.
- Every guardrail and prompt-injection test passes on `main`.
- The PWA installs cleanly on iOS and Android.
- A first-time visitor to the public URL can read about the project, browse a seeded archive, ask Reflection a real question, and tap a citation chip back to the original audio — all without a login.

That is v1.

---

## Deferred items (revisit before public release)

Things explicitly skipped or partially shipped during the agent-paced build.
Each entry names the phase, the reason for deferral, and the cost to finish.

| Phase | Item | Status | Reason | Cost to finish |
|---|---|---|---|---|
| B5 | **IndexedDB drafts via Dexie** — write audio blob to client-side persistent storage *before* network upload so a closed tab or lost connection doesn't drop a recording | not started | Not on the demo critical path; demo recordings happen on stable WiFi where this never fires. Strongly affects real-world trust ("this will not be lost") | ~1 hr; 200–300 lines |
| B (polish) | **Capture status SSE granularity** — pipeline currently coalesces stages so the SSE jumps `uploaded → embedded → ready` without surfacing `transcribed` / `tagged` as separate UI moments | partial | The transitions are emitted by the pipeline but the polling loop in `/api/capture/[id]/status` is too coarse to consistently catch each one before the next overwrites it | ~30 min; replace polling with an event table or pg LISTEN/NOTIFY |
| A7 | **CI workflow** (`.github/workflows/ci.yaml`) — lint + typecheck + tests on every PR | not started | No PRs yet; local dev runs the typecheck manually | ~20 min; one yaml file |
| C9 | **Guardrail tests as vitest suite** — codify the seven non-negotiables from `GUARDRAILS.md §1` plus the full `PROMPT_INJECTION_TESTS.md` corpus | not started | Verifying visually first to land the working surface; tests will pin the working behavior | ~2 hr; one test file per guardrail |
| C (polish) | **Reflection answer history** — past Reflection queries cached and re-displayable | not started | Single-turn is enough for the demo; multi-turn is a v2 affordance | ~1 hr |
| C | **Recalibrate `REFLECTION_SIMILARITY_THRESHOLD`** | shipped at 0.40 (was 0.55 in design) | EmbeddingGemma's similarity distribution is lower than the model the original 0.55 was tuned against. Current value matches the 4-capture dev corpus; needs to be re-validated when the seed corpus is in place | ~30 min; collect 20 known-match + 20 known-miss queries, plot, pick the trough between distributions |

# EXECUTION-PLAN.md

Agent-paced execution plan for Heirloom v1. The unit of work is the **phase**; each phase has a deliverable, acceptance criteria, and a list of parallelizable sub-tasks.

The architecture-anchored milestone view lives in `design-system/handoff/MILESTONES.md`. This file is the doing-view: what an AI agent can pick up and execute today, in order, with the right work running in parallel.

> **Scope discipline.** v1 ships the smallest honest version of Heirloom that proves the architecture: grounded retrieval, citation chips, sealed-letter handoff, executor unlock. Photo / video capture, threads, voice-clone consent, notifications, and account deletion are designed but not built. See `design-system/DESIGN-v1.md §1`.

---

## Preflight (human-driven, one-time)

These are the bits an AI agent cannot do alone — they require credentials, GPU quota, or physical action. Get them done before Phase A begins.

| # | Task | Owner | Estimate |
|---|---|---|---|
| P1 | Provision the inference host: single GPU VM, Ubuntu 22.04, CUDA 12.x, nginx + Let's Encrypt cert | human | 30 min |
| P2 | `ollama pull <gemma4-synthesis>`, `ollama pull <gemma4-small>`, `ollama pull <embedding-gemma>` on the host | human | 20 min (pull) |
| P3 | Postgres 16 + pgvector running on the host, with a `heirloom_app` role and an empty `heirloom` database | human | 10 min |
| P4 | Vercel project created and pointed at this repo; `NEXT_PUBLIC_API_URL` env var set to the inference host's HTTPS endpoint | human | 5 min |
| P5 | Object storage (S3-compatible) bucket + credentials available as env vars on the inference host | human | 10 min |

Verification: `curl https://<api-host>/health` returns 200 once Phase A's `/health` route lands. Until then, this is a credential-and-DNS prerequisite, not a code dependency.

---

## Phase A — Scaffolding (parallel)

**Goal:** Both apps boot. Tokens live in Tailwind. CI runs a green lint+typecheck+test pipeline.

**Parallelizable sub-tasks:**

- **A1 · Next.js scaffold.** `npx create-next-app@latest frontend --typescript --tailwind --app --src-dir --import-alias "@/*"`. Strip the default page. Install `@vercel/ai`, `framer-motion`, `next-pwa`, `dexie`.
- **A2 · Token preset.** Lift CSS variables from `design-system/Heirloom Design System.html` into `frontend/tailwind.config.ts` and `frontend/src/app/globals.css`. Verify colors, type ramp, radii, spacing tokens, motion tokens. The design system HTML is the source of truth.
- **A3 · Font self-hosting.** Add Newsreader, Geist, JetBrains Mono as woff2 in `frontend/public/fonts/`. Register them via `next/font/local`. No CDN font loads.
- **A4 · FastAPI scaffold.** `uv init backend`. Add `fastapi[standard]`, `uvicorn[standard]`, `gunicorn`, `pydantic`, `asyncpg`, `pgvector`, `argon2-cffi`, `python-jose`, `structlog`. Implement `/health`, `/auth/magic-link`, `/auth/verify` stubs and the JWT middleware (verify token, open transaction, `SET LOCAL app.user_id`, `SET LOCAL app.role`, run, commit).
- **A5 · Schema applied.** `psql -f design-system/handoff/SCHEMA.sql`. Verify every table is created and RLS is enabled with `\dt+` and `\dp`.
- **A6 · CI workflow.** `.github/workflows/ci.yaml` runs lint (eslint + ruff), typecheck (tsc + mypy), unit tests (vitest + pytest), and the guardrail test suite stub. PR-gated.

**Acceptance:**
- `curl https://<api-host>/health` returns 200
- Skeleton Next.js home is live at the Vercel URL and renders one full-bleed `--bone` page with the Newsreader display token applied
- CI green on a placeholder PR

---

## Phase B — Capture commit pipeline

**Goal:** Audio capture works end-to-end. A 30-second recording → Whisper transcript → EmbeddingGemma chunks → Gemma 4 (small) tags → home shows the new capture, all within 15 seconds.

**Sub-tasks (sequential where dependent, parallel otherwise):**

- **B1 · `POST /capture` multipart handler.** Accept the audio blob + metadata, write to object storage, insert a `captures` row with `status='processing'`, return `{ capture_id, status }`.
- **B2 · Background pipeline.** Whisper transcribes → insert `transcripts` → chunk transcript at 512 tokens (64-token overlap) → embed each chunk with EmbeddingGemma → insert `transcript_chunks` → run `capture_tagging_v1` against Gemma 4 (small) → insert `capture_tags` → set `captures.status='ready'`.
- **B3 · `GET /capture/{id}/status` SSE endpoint.** Stream status events: `uploaded`, `transcribed`, `embedded`, `tagged`, `ready`. Final event includes the full capture payload.
- **B4 · Capture sheet (voice).** Port `Creator Onboarding.html` step 5. MediaRecorder, live waveform via canvas, streaming transcript pane, oxblood record button.
- **B5 · IndexedDB drafts.** A Dexie DB for in-flight captures. The audio blob is written to IndexedDB *before* network upload begins, so a connection drop preserves the recording.
- **B6 · Post-capture review.** Render streamed tags as removable chips. Render the gentle follow-up question from `followup_question_v1`. Two equal-weight buttons: `Save and rest` / `Record one more`.
- **B7 · Creator home (minimal).** Render greeting block, prompt-of-day card, capture chip grid (only voice + note enabled), and the recent-captures feed.

**Acceptance:**
- A real 30s audio recording from a phone browser commits, transcribes, tags, and appears on `/me/home` within 15 seconds (excluding Whisper cold load)
- The capture survives a forced page reload mid-upload (IndexedDB queue resumes)
- Tags render as oxblood pill chips; removing a tag PATCHes the capture

---

## Phase C — Reflection (the load-bearing surface)

**Goal:** A nominee types a question, retrieval runs, and either the empty-state copy or a streaming, fully-cited answer appears. No first-person impersonation. No ungrounded synthesis. Ever.

**Sub-tasks:**

- **C1 · Embedding endpoint.** `embed(text) -> Vector(768)` wrapping the EmbeddingGemma Ollama call.
- **C2 · Retrieval query.** `pg.fetch_top_k(q_embedding, vault_id, k=8)` with cosine similarity. Returns `[{capture_id, chunk_text, similarity}]`.
- **C3 · The grounding gate.** `if not chunks or chunks[0].similarity < REFLECTION_SIMILARITY_THRESHOLD: return EMPTY_STATE_RESPONSE`. The threshold (start 0.55) is a single constant; do not branch around it. The test `test_empty_state_on_low_similarity` must be green before C4 begins.
- **C4 · Synthesis call.** Pass top-k chunks to Gemma 4 (synthesis) using `reflection_synthesis_v1`. Stream Ollama's JSON-mode output.
- **C5 · Citation validator.** For every `claims[*].citations[*]`, assert the UUID is in the retrieved set. On mismatch, log a `validator_rejection` event and serve the empty state.
- **C6 · First-person scrubber.** `has_first_person_outside_quotes(answer)` → if true, log `first_person_violation` and serve the empty state.
- **C7 · `POST /reflect` SSE handler.** Emit `retrieved`, `grounded`, `claim`, `done` events as documented in `API_CONTRACTS.md §8`.
- **C8 · Reflection sheet (frontend).** Port `Nominee Reveal.html` step 5. Streaming claim rendering. Citation chips render as monospaced superscripts. Tap a chip → citation drawer slides up with the original capture + audio scrubber jumped to the cited timestamp.
- **C9 · Guardrail tests.** Implement all seven non-negotiables from `GUARDRAILS.md §1` in `tests/guardrails/`. Implement the prompt-injection harness from `PROMPT_INJECTION_TESTS.md`. CI must run them on every PR.

**Acceptance:**
- All seven guardrail tests pass
- The prompt-injection harness (all categories) passes
- A grounded query returns its first streaming claim in < 3s
- An ungrounded query returns the empty state in < 200ms (no model call)

---

## Phase D — Nominee handoff (the ceremonial surface)

**Goal:** Nominee onboarding works. Sealed envelope, passphrase entry, seal-break animation, letter unfolds, cinematic intro, nominee home.

**Sub-tasks:**

- **D1 · Magic-link auth.** `POST /auth/magic-link` queues an email with a short-lived JWT-signed token. `POST /auth/verify` exchanges the token for a session JWT scoped to the right `vault_id` and `role`.
- **D2 · Nominee onboarding flow.** Port `Nominee Reveal.html`. Envelope screen → passphrase input → seal-break CSS keyframe animation → letter unfolds → cinematic intro → nominee home.
- **D3 · Nominee home.** Framing strip ("From <creator name>") + latest-unlocked hero + sealed pieces + saved passages section + floating Reflection pill.
- **D4 · Creator-side nominee assignment UI.** Nominees list, add nominee, set relationship + email, assign captures (all / curated / except), set release condition (anytime / scheduled / executor).
- **D5 · `POST /executor/setup`.** Generate a passphrase (four-word + 2-digit suffix), Argon2id-hash, store in `executor_credentials`. Return the plaintext passphrase **once** in the HTTP response body, never again. Render it as a printable letter the creator can hand off out-of-band.
- **D6 · `POST /executor/unlock`.** Verify the passphrase, atomically flip every `nominee_releases` row for this vault from `released_at IS NULL` to `released_at = now()`. Rate-limited: 5 attempts / IP / hour, 10 lifetime per credential.

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
- **F4 · Fallback walkthrough.** A separate Vercel project serves the prototype HTMLs with a banner — *"This is a static walkthrough; the live product is at \<URL\>"* — so a visitor lands somewhere coherent even if the inference host hiccups.

**Acceptance:**
- Every test passes on `main`
- The product narrative works end-to-end on real devices
- The fallback walkthrough is deployed and reachable

---

## Parallelization map (for a multi-agent run)

If multiple agents are running concurrently, this is the safe parallelization:

```
Phase A:  A1  A2  A3  A4  A5  A6        ← all in parallel
Phase B:  B1 → B2 → B3                  ← sequential (data flow)
          B4  B5  B6  B7                ← parallel with backend
Phase C:  C1  C2 → C3 → C4 → C5 → C6 → C7    ← grounding pipeline is sequential
          C8                            ← parallel with backend
          C9                            ← starts when C3 is green
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

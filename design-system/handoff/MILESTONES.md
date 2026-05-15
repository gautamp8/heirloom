# MILESTONES.md

Phase-by-phase build sequence for Heirloom v1, with goals, acceptance criteria, and named risks per phase.

The shape: **back-end first**, **scaffold the screens fast**, **invest the final phase in polish and seeded content**.

---

## Phase 0 - Setup

**Goal:** Working dev environment, models pulled, schema applied.

**Tasks:**
- Provision the inference host (single VM with a GPU, Ubuntu 22.04). Install CUDA, Postgres 16, Ollama, ffmpeg.
- `ollama pull <gemma4-synthesis>`, `ollama pull <gemma4-small>`, `ollama pull <embedding-gemma>`.
- Apply `SCHEMA.sql` to a fresh Postgres database. Verify pgvector extension.
- Create Vercel project. Wire `NEXT_PUBLIC_API_URL` to the inference host's nginx endpoint.
- Skeleton FastAPI app with `/health` and JWT middleware (no real handlers yet).
- Skeleton Next.js app with the auth route + a `/dev` page rendering the design system tokens.

**Acceptance:**
- `curl https://api.../health` returns 200
- The skeleton Next.js home is live at the Vercel URL
- `ollama run <gemma4-small> "test"` returns coherent text on the inference host

**Risk:** GPU quota approval can take 2–24h on some clouds. Apply for it before any other Phase 0 work begins.

---

## Phase 1 - Capture commit pipeline (creator)

**Goal:** Voice capture works end-to-end: record → upload → Whisper → embed → tag → home shows it.

**Tasks (backend):**
- `POST /capture` multipart handler (audio first)
- Object storage upload
- Whisper subprocess wrapper
- EmbeddingGemma chunk + embed pipeline
- Gemma 4 (small) tagging using `capture_tagging_v1` prompt
- SSE status endpoint `GET /capture/{id}/status`

**Tasks (frontend):**
- Capture sheet (voice mode) - port from `Creator Onboarding.html` step 5
- MediaRecorder + waveform visualizer
- IndexedDB draft + upload queue (basic)
- Post-capture review screen rendering streamed tags

**Acceptance:**
- A 30s audio file commits, transcribes, tags, and appears on `/me/home` within **15 seconds total**
- `test_capture_commit_e2e` passes in CI

**Risk:** Whisper cold-load is slow. Warm a model process at FastAPI startup.

---

## Phase 2 - Remaining capture modes + home

**Goal:** Photo, note, video all commit. Creator home renders fully.

**Tasks (backend):**
- `POST /capture` accepts photo, note, video kinds
- `GET /me/home` (creator-side payload)
- `GET /captures` paginated list

**Tasks (frontend):**
- Three more capture sheets - port patterns from `Creator Home - Established.html`
- Creator home: greeting, prompt card, chip grid, thread cards, recent captures, nominee cards
- Prompt-of-day cache (24h)

**Acceptance:**
- All four capture modes commit and render correctly
- Creator home matches the prototype at 390px width
- Visual diff against the prototype < 5% pixel-mismatch (loose acceptance)

**Risk:** Video transcoding on the client is the biggest unknown. Have a fallback path that uploads original and transcodes server-side via ffmpeg.

---

## Phase 3 - Nominee + Reflection

**Goal:** Reflection works end-to-end with the grounding contract enforced.

**Tasks (backend):**
- `POST /reflect` SSE handler implementing the grounding gate (similarity threshold + Gemma 4 synthesis + citation validator)
- `POST /nominee`, `POST /nominee/{id}/release`
- `GET /me/home` (nominee-side payload, RLS-enforced)
- Implement all guardrail tests in `tests/guardrails/`

**Tasks (frontend):**
- Reflection sheet - port from `Nominee Reveal.html` step 5
- Citation drawer
- Nominee home - port from `Nominee Home - Post-Loss.html`
- Nominees list + release-assignment UI for the creator

**Acceptance:**
- All 7 guardrail tests pass
- A Reflection query returns a streaming JSON response with valid citations within 3s
- Empty-state path returns in < 200ms (no Gemma call)

**Risk:** Gemma 4 JSON-mode reliability. If it fabricates, the validator catches it and we fall back to the empty state. Verify this behavior end-to-end during Phase 3, not later.

---

## Phase 4 - Nominee onboarding + executor

**Goal:** The seal-break + executor flows ship.

**Tasks (backend):**
- `POST /auth/magic-link`, `POST /auth/verify`
- `POST /executor/setup`, `POST /executor/unlock`
- Argon2id passphrase hashing
- Rate-limit middleware on auth + unlock endpoints

**Tasks (frontend):**
- Port the full `Nominee Reveal.html` flow (envelope → seal break → letter → welcome)
- Executor handoff v1 (3 steps, see `SCREENS.md` §10)
- Executor unlock screen
- Preview-as-nominee ribbon + route

**Acceptance:**
- `test_seal_animation_completes` passes (CSS animation regression)
- An executor passphrase round-trip works: generate → store hashed → unlock → all releases flip
- Rate limit on `POST /executor/unlock` denies the 6th attempt

**Risk:** The seal-break animation is the emotional climax of the nominee flow. Build it last but test it first - if CSS doesn't sell it, fall back to a pre-rendered 1.2s video.

---

## Phase 5 - Settings, threads, polish

**Goal:** Everything else ships. Polish pass.

**Tasks:**
- `POST /thread`, thread detail screen, thread cards
- Settings screen (account, passphrase, notifications, sign-out, delete)
- Saved passages list
- PWA manifest, service worker, install nudge
- Empty states (all canonical from `FLOWS.md` §16)
- Accessibility pass: focus order, ARIA labels, color contrast
- Performance pass: Lighthouse ≥ 90 on all routes

**Acceptance:**
- Lighthouse PWA score ≥ 95
- Lighthouse accessibility score ≥ 95
- All canonical empty states render correctly when their preconditions are met

**Risk:** Scope creep on settings. Cut deletion if time-pinched (designed, not built - add to OPERATIONS.md).

---

## Phase 6 - Seed data + product story

**Goal:** The product has a real archive to demonstrate retrieval and grounding against.

**Tasks:**
- Seed a real archive of ~25 captures across kinds + tags + threads. Use real human voice for the audio captures so transcription, tagging, and Reflection all run against real signal.
- Validate Reflection on the seeded archive - both grounded answers and the empty-state path.
- Author a public-facing project narrative that explains the architecture, the grounding contract, and the on-device target.

**Tasks (cover assets):**
- Cover image: a hero shot of the sealed envelope opening.
- Repo `README.md` explains how to run locally.
- A live URL works in incognito.

**Acceptance:**
- The seeded archive exercises every code path in Reflection (grounded, ungrounded, multi-citation, single-citation).
- The repo runs locally with a documented `ollama pull` + `docker compose up` sequence.

**Risk:** Real human-voice recording always takes longer than expected. Block dedicated time.

---

## Phase 7 - Final pass

**Goal:** Final polish. Fix one thing. Verify offline. Verify guardrails.

**Tasks:**
- Re-run the full guardrail and prompt-injection suite on a fresh deployment.
- Run the "Verify offline" path on real hardware. Confirm capture queues + service-worker fallbacks behave.
- Apply at most one polish change. Resist re-cutting cover assets unless something is materially broken.

**Risk:** Final-pass production bugs. Maintain a fallback static walkthrough deployed to a separate Vercel project that serves the prototypes with a banner - *"This is a static walkthrough; the live product is at \<URL\>"* - so any user landing on the URL sees something coherent even if the inference host hiccups.

---

## Hard cuts if behind

In priority order, cut from the bottom:
1. **Settings → Delete account** - design only, stub the route
2. **Video capture** - voice + photo + note are enough for the product narrative
3. **Threads** - recent-captures feed alone is fine
4. **Preview-as-nominee** - designed, not built (the doc still proves we thought of it)
5. **Saved passages** - designed, not built
6. **Notifications** - designed, not built

Never cut from the top: capture commit, Reflection, seal-break, executor unlock.

---

## CI/CD

- GitHub Actions: lint + typecheck + unit + guardrail tests on every PR
- Vercel preview deploys on every branch
- Inference host redeploys via `git pull && systemctl restart heirloom-api` on `main` push (simple cron-watched git remote in v1)

Database migrations: Alembic. New migrations are review-gated.

---

## On-call

For the duration of the v1 build, treat any production error on the staging URL as p0. Keep an `incidents/` folder logging anything that broke and how it was fixed - this becomes a useful regression record.

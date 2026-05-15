# Heirloom - Handoff Package

This folder is the developer-handoff package for the Heirloom v1 codebase. It is written to be consumed by an engineer (human or AI) with no further design input required.

The package is **eleven focused docs**. Each has one job.

---

## What Heirloom is

Heirloom is a **private, local-first memory vault**. A creator records stories, lessons, letters, and reflections - voice, photo+caption, written note. Each piece is tagged by Gemma 4 (the smaller variant), embedded with EmbeddingGemma, and stored in Postgres + pgvector (web/server) or SQLite + sqlite-vec (desktop bundle). Creators assign **nominees** (people who will eventually receive the archive). Captures auto-release to every nominee on save by default; **sealed letters** stay closed until a release condition fires (date, life event, semantic match against a question or mood). When a nominee opens the archive, **Reflection** answers their questions about the creator in third person, with citation chips back to the exact captures - only when the question is grounded in the creator's own recorded material.

The product narrative is **on-device, local-first, your archive does not leave your machine.** The canonical install is `./install.sh` on the creator's own Mac; the same code also runs on a single self-hosted VM, and ships as a Tauri-bundled macOS `.dmg` with sidecars for Ollama, whisper-cpp, and the bundled Node server.

---

## Product narrative

1. A creator opens Heirloom on her phone. The home is calm, paper-toned. She taps "Speak it" against a Gemma-generated prompt of the day and records a short voice memory about her father. Whisper transcribes it in the background, Gemma tags it, an auto-title appears within a minute.
2. During onboarding she named her daughter as nominee and wrote her a short sealed letter "for when you feel lost." The letter's intent prompt was embedded.
3. Years later, the daughter taps the sealed-envelope tile in her browser, enters the passphrase the creator handed her in person, and lands on the nominee home.
4. She asks: *"What did mom think about leaving home?"* Reflection retrieves five captures, streams a third-person answer with citation chips, and offers a "Hear in their voice" button that plays the cited transcript through the creator's cloned voice - verbatim only, never new sentences.
5. End: "Heirloom. Local-first. Built on Gemma 4."

Every screen in the app is in service of this narrative.

---

## Tech stack (actual)

- **Frontend:** Next.js 16 (App Router, RSC, Turbopack) + React + TypeScript + Tailwind v4 with custom `@theme static` tokens, Framer Motion. Deployed as a PWA on the same Next.js server that hosts the API; on the desktop bundle, the standalone server runs at `127.0.0.1:3000` inside the .app.
- **Backend:** Next.js route handlers under `src/app/api/*`. `postgres.js` for SQL with per-request `withRls()` wrapping every transaction; `argon2` for passphrases (executor + per-nominee); `jose` for JWT session cookies.
- **Database:** PostgreSQL 16 + pgvector (server install). SQLite + `sqlite-vec` (desktop bundle - `HEIRLOOM_BACKEND=sqlite`). RLS on every table on Postgres; the SQLite path is single-user so it drops RLS entirely.
- **AI runtime:** Ollama at `127.0.0.1:11434` hosts `gemma4:e4b` (text + vision), `embeddinggemma` (768-dim), and the custom `heirloom/gemma4-grounded` Modelfile. Whisper-cpp `small.en` runs as a subprocess for audio transcription.
- **Voice cloning:** LuxTTS/ZipVoice FastAPI sidecar at `127.0.0.1:11435` (`infra/tts-server/`) is optional; verbatim-only contract enforced at the call sites. See `GUARDRAILS.md` §11.
- **Face recognition:** face-api.js in the browser (128-dim descriptors) - faces never leave the device.
- **Notifications:** Web Push via VAPID. iOS PWA push requires "Add to Home Screen" first.
- **Auth:** Cookie-bound JWT (HS256, `jose`). Sessions are 30 days. No magic-link, no email - sessions are issued at portal-passphrase entry (nominee) or onboarding completion (creator).

---

## Doc map

| # | File | What it answers |
|---|---|---|
| 1 | `README.md` (this file) | What is this, narrative, stack, doc map |
| 2 | `ARCHITECTURE.md` | System diagram, data flow, deployment shapes (laptop / VM / .dmg) |
| 3 | `FLOWS.md` | Every screen, happy + alternate + failure paths |
| 4 | `SCHEMA.sql` | Postgres tables, indexes, RLS policies |
| 5 | `API_CONTRACTS.md` | Next.js route-handler endpoints with TypeScript types |
| 6 | `SCREENS.md` | Screen → file → components → API → acceptance |
| 7 | `PROMPTS.md` | Gemma 4 prompts, safety preamble, grounding contract |
| 8 | `GUARDRAILS.md` | DO-NOT list mapped to enforceable code mechanisms |
| 9 | `PWA.md` | Manifest, service worker, Web Push, offline behaviour |
| 10 | `MILESTONES.md` | Phase-by-phase build sequence with acceptance criteria |
| 11 | `PROMPT_INJECTION_TESTS.md` | Adversarial test corpus, must-pass |

Plus:
- `../Heirloom Design System.html` - visual reference (do not edit)
- `../prototypes/*.html` - frozen visual references
- `../DESIGN.md` + `../DESIGN-v1.md` - design rationale
- `../APP.md` - product brief

---

## How to use this package

1. **Read README.md, ARCHITECTURE.md, MILESTONES.md first.** That's the 3-doc orientation.
2. **For each surface**, read the relevant section of SCREENS.md, then the flows it touches (FLOWS.md), then the contracts it depends on (SCHEMA.sql, API_CONTRACTS.md, PROMPTS.md).
3. **Before touching anything Reflection-adjacent**, read GUARDRAILS.md and PROMPT_INJECTION_TESTS.md in full.
4. **For visual fidelity**, open the prototype HTML and the design system HTML in a browser side-by-side with your editor. The prototypes are the source of truth for spacing, color, and motion - if the running app diverges from a prototype, the running app wins for behaviour; the prototype wins for type and palette.

---

## Non-negotiables

1. **Reflection never speaks as the creator.** Third person only. *"Your mother said…"*, not *"I said…"*.
2. **Reflection never synthesizes ungrounded answers.** If retrieval top-similarity is below `0.40`, the empty-state copy is served verbatim and Gemma is never invoked.
3. **Every Reflection claim has a citation.** No claim ships without at least one `capture_id` from the retrieved set. The streaming SSE handler validates citations against the retrieved set per-claim; final answers run the citation validator + first-person scrubber a second time before sending the final `answer` event.
4. **Creator captures are immutable post-`ready`.** Edits to body/caption/blob/duration after `status='ready'` raise an exception (Postgres trigger). Title + tags remain editable.
5. **Nominees cannot read unreleased captures.** Enforced by RLS at the row level, not just the UI. Profile/identity-index captures (`is_profile = true`) are an explicit RLS exception so retrieval can answer "who is X?" without a release row.
6. **The executor passphrase is delivered out-of-band only.** The app stores `argon2id(passphrase)` and reveals plaintext only once at generation. No email, no in-app share affordance.
7. **No analytics on Reflection queries.** The diagnostics persisted in `reflections.answer_json` stay in the user's database and surface only at `/transparency`.
8. **TTS is verbatim only.** The voice-clone sidecar plays back text the creator wrote/recorded - capture bodies, transcript lines, sealed-letter bodies, Reflection citation snippets. Never the model's synthesized answer prose. See GUARDRAILS.md §11.

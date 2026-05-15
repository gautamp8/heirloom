# Heirloom - Handoff Package

This folder is the **complete developer-handoff package** for building Heirloom v1. It is written to be consumed by an engineer (human or AI) with no further design input required.

The package is **eleven focused docs**. Each has one job. Read in order.

---

## What Heirloom is

Heirloom is a **private, local-first memory vault**. Creators record stories, lessons, letters, and reflections - voice, photo+caption, written note, or short video. Each piece is tagged by Gemma 4 (the smaller variant), embedded with EmbeddingGemma, and stored in Postgres + pgvector. Creators assign **nominees** (people who will eventually receive the archive) and **release conditions** (a scheduled date, or by-request). When a release condition is met, the nominee opens a **sealed letter** and enters a private archive they can browse, search, replay, and *ask* - Reflection answers their questions about the creator (third person, never impersonation) **only when grounded** in the creator's own captures.

The product narrative is **on-device, local-first, your archive does not leave your machine.** v1 hosts inference on a single GPU host because shipping the full Ollama runtime through a browser is a v2 packaging concern - the architecture, prompts, and copy are written for the on-device target.

---

## Product narrative

1. A creator opens Heirloom on her phone. The home is calm, paper-toned. She taps the prompt of the day and records a short voice memory about her father. Gemma 4 streams the transcript live. She saves it.
2. She names her daughter as nominee, writes her a one-line letter, and sets a release condition.
3. Years later, the nominee opens Heirloom. A sealed envelope. She enters the passphrase. The wax seal breaks. The letter unfolds. She enters the archive.
4. She asks: *"What did mom believe about marriage?"* Reflection retrieves three captures and answers with citation chips. She taps a chip - the original audio plays, in the creator's actual voice.
5. End: "Heirloom. Local-first. Your archive lives on your machine. Built on Gemma 4."

Every screen in the app is in service of this narrative.

---

## Tech stack (locked)

- **Frontend:** Next.js 14 (App Router) + React 18 + TypeScript + Tailwind, deployed as a **PWA on Vercel**
- **Backend:** FastAPI (Python 3.11) on **Azure VM (Standard NC-series, GPU)** with `uvicorn` + `gunicorn`
- **Database:** Postgres 16 + **pgvector** extension, same VM as backend
- **Inference:** **Ollama** with **Gemma 4 26B** (Reflection synthesis) + **Gemma 4 E4B** (capture tagging, gentle prompts) + **EmbeddingGemma** (vector embeddings) - all running on the Azure VM
- **Auth:** Magic-link via short-lived JWT (no passwords; passphrases are *release secrets*, not login secrets)
- **Storage:** S3-compatible blob (Azure Blob Storage in v1) for audio/video/photo originals
- **Transcription:** Whisper (large-v3) running on-VM for v1 (offline-friendly; can swap for Gemma 4 audio later)

**Future (v2, not in v1):** Tauri shell + bundled Ollama + on-device EmbeddingGemma. The toggle is designed-in (`mode` flag on Reflection API).

---

## Doc map

| # | File | What it answers |
|---|---|---|
| 1 | `README.md` (this file) | What is this, demo arc, stack, doc map |
| 2 | `ARCHITECTURE.md` | System diagram, data flow, deployment topology |
| 3 | `FLOWS.md` | Every screen, happy + alternate + failure paths |
| 4 | `SCHEMA.sql` | Postgres tables, indexes, RLS policies |
| 5 | `API_CONTRACTS.md` | FastAPI endpoints with TypeScript types |
| 6 | `SCREENS.md` | Screen → prototype → components → API → acceptance |
| 7 | `PROMPTS.md` | Gemma 4 prompts, versioned, with safety preamble |
| 8 | `GUARDRAILS.md` | DO-NOT list mapped to enforceable code mechanisms |
| 9 | `PWA.md` | Manifest, service worker, install prompt, offline fallback |
| 10 | `MILESTONES.md` | Phase-by-phase build sequence with acceptance criteria |
| 11 | `PROMPT_INJECTION_TESTS.md` | Adversarial test corpus, must-pass |

Plus:
- `../Heirloom Design System.html` - visual reference
- `../prototypes/*.html` - interactive references (open each in a browser)
- `../DESIGN.md` + `../DESIGN-v1.md` - design rationale
- `../APP.md` - original product brief

---

## How to use this package

1. **Read README.md, ARCHITECTURE.md, MILESTONES.md first.** That's the 3-doc orientation.
2. **For each phase**, read the relevant section of MILESTONES.md, then the screens and flows it touches (SCREENS.md, FLOWS.md), then the contracts it depends on (SCHEMA.sql, API_CONTRACTS.md, PROMPTS.md).
3. **Before writing any Gemma 4 prompt or Reflection code**, read GUARDRAILS.md and PROMPT_INJECTION_TESTS.md in full. Implement the tests first; they fail until you write the production code correctly.
4. **For visual fidelity**, open the prototype HTML and the design system HTML in a browser side-by-side with your editor. The prototypes are the source of truth for spacing, color, motion, and copy tone.

---

## Non-negotiables (read before you write a single line)

1. **Reflection never speaks as the creator.** Third person only. *"Your mother said…"*, not *"I said…"*.
2. **Reflection never synthesizes ungrounded answers.** If retrieval similarity is below threshold, the answer is the empty-state copy verbatim.
3. **Every Reflection claim has a citation.** No claim ships without at least one `memory_id` it can be traced to.
4. **Creator captures are immutable once saved.** Edits create new revisions; the original is preserved.
5. **Nominees cannot see creator-side controls.** RLS enforces this at the database layer, not just the UI.
6. **The executor passphrase is delivered out-of-band only.** The app never emails it, never stores it in plaintext after generation, and never logs it.
7. **No analytics on Reflection queries.** Whatever nominees ask is theirs alone.

These are tested. Tests live in `tests/guardrails/` and are part of CI.

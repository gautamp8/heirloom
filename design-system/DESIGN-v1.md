# Heirloom - Design Addendum for v1

This file is the **delta** layered on top of `DESIGN.md` and `Heirloom Design System.html`. It captures the v1 build scope and the design patterns we resolved while building the prototypes (`prototypes/`).

> The product narrative is **local-first, on-device, your archive does not leave your machine.** v1 hosts inference on a single GPU host (FastAPI + Postgres + Ollama/Gemma 4 + EmbeddingGemma) because the full on-device runtime is a v2 packaging concern. The architecture is local-capable; the copy, design, and voice in the app reflect the on-device target.

---

## 1. v1 Scope (in / out)

### In - ships in v1
- **Capture (all four modes):** voice, photo + caption, written note, short video (≤2 min)
- **Per-capture tagging** by Gemma 4 (E4B) - emotional & topical
- **Threads** - multi-capture topic groupings, surfaced on both creator and nominee homes
- **Nominee assignment** - name, relationship, optional letter copy
- **Executor - single-passphrase v1** (see §5)
- **Release conditions:** *scheduled date* + *creator marks released* (no executor-trigger automation in v1)
- **Sealed-letter generation** for nominees and for the executor
- **Nominee onboarding flow** - envelope, seal break, cinematic intro (built ✓)
- **View mode for nominees** - home, threads, latest-unlocked hero, sealed pieces, saved passages
- **Reflection (grounded)** - query → top-k retrieval → citation-chip answer → "I don't have that in the archive" empty state
- **Playback** of original recordings (audio + video)

### Out for v1 (designed, not built)
- **Voice cloning / TTS** - playback only. Self-clone is the v2 story.
- **Executor Shamir 2-of-3** - the prototype stays as the v2 narrative.
- **Annotate-back** (nominee writes a private response into their copy) - v2.
- **Multi-keeper recovery** - v2.
- **On-device LLM toggle** - designed as a `mode` flag in the Reflection API; v1 = server Gemma 4, v2 = WebGPU/transformers.js fallback.

---

## 2. Capture Pattern (resolved)

All four modes share a **bottom-sheet** surface launched from the creator home. The sheet has a consistent shell:
1. **Sheet handle** (drag indicator)
2. **Title** in Source Serif italic (mode name)
3. **Sheet prompt** - one line of editorial guidance ("A single photo, a single line.")
4. **Mode-specific body**
5. **Save row** - `Save later` (secondary) + `Save to vault` (primary ink pill)

### Voice
Live waveform, time elapsed, streaming transcript (italic Source Serif, muted). One large oxblood record button (72px circle). Stop = square inside circle.

### Photo + Caption
4:5 image frame (warm sepia gradient placeholder until user adds a photo). Below: a borderless italic textarea for a one-sentence caption. Tools row: `Retake`, `From library`, `Date`.

### Note
Borderless 17px Source Serif textarea, min-height 280px. Footer: word count + autosave state in mono.

### Video
9:16 frame (max 340h), dark interior, recording-dot + time HUD. Inline guidance under the frame: *"Look into the camera as if you were looking at her."*

---

## 3. Creator Home Patterns (resolved)

Building `Creator Home - Established.html` settled five new components:

- **Greeting block** - date in mono, "Good morning, Elena" in 34px Source Serif w/ oxblood-italic first name
- **Prompt card** - warm-paper background, italic 21px quote, primary `Begin →` + `Skip · maybe later` link
- **Capture chip grid** - 2×2; each chip is a paper-card with a 32px oxblood glyph, mode name (sans), and a mono sub-label ("a recording", "with a caption", etc.)
- **Thread card** - left stripe (oxblood / sepia / muted / moss), title in serif, stats in mono, right arrow. Stripe color encodes thread mood, not category.
- **Nominee card** - avatar (single italic letter in oxblood) + name + relationship + status meta line. Executor variant inverts the avatar (ink fill, mono "EX" label, moss-dot status).

Tab bar is paper-tinted with backdrop-blur, 3 destinations: Home / Explore / You. Floating Reflection pill is the nominee-side equivalent.

---

## 4. Nominee Home Patterns (resolved)

Building `Nominee Home - Post-Loss.html` settled four new patterns:

- **"From creator" framing strip** - small warm-paper card at the top with a wax-seal H avatar + a one-line release statement. This is the gentle re-anchor on every visit.
- **Latest-unlocked hero** - paper-card with oxblood left stripe, a `Latest unlocked` badge, italic-serif 22px headline, mono attribution, snippet, scrubber-style waveform, play button + duration + `Open →` button.
- **Sealed-pieces card** - paper-deep background, lock icon, italic-oxblood release condition ("sealed *until you ask for it*" / "releases *12 March 2027*"), piece count tag on right. **Tweak**: title visible OR blurred (some families want full opacity, others total).
- **Saved passage** - pulled-quote card with large oxblood open-quote glyph, italic-serif 16px quote (text-wrap: pretty), mono attribution row + save state.

Persistent floating **Reflection pill** sits 78px above the tab bar - ink background, italic-serif label "Ask the archive a question".

---

## 5. Executor Handoff Pattern (v1 simplified)

The prototype (`Executor Handoff.html`) demos the **4-step Shamir 2-of-3** flow as the v2 narrative. For v1 ship-as:

> Creator names executor (name + email + relationship) → app generates **one passphrase** + **one sealed letter** → creator delivers letter out-of-band (print or email) → if the archive ever needs to be opened without the creator, the executor enters that passphrase on the same app to flip nominee assignments from `scheduled` to `released`.

UI changes for v1:
- **Step 3 of 4 (the Shamir split diagram)** is replaced with a simpler "your passphrase" screen - single oxblood passphrase block (`willow · bread · river · 14`), with `Regenerate` and `Copy`.
- **Step 4 letter preview** stays - only the "your share of the key" line becomes "your passphrase".
- The 2-of-3 diagram is preserved in `Heirloom Design System.html` under "Future patterns" so the v2 story stays demonstrable.

---

## 6. Reflection Grounding Contract (locked)

Rendered as the prototype shows, enforced server-side:

1. **Retrieve first.** Top-k from pgvector (k=8). If best similarity < `THRESHOLD` (start 0.55, tune from seed data), return the **empty state**: *"I don't have that in the archive. Try asking another way?"* - never synthesize.
2. **Synthesize with citations.** Every claim in the answer must map to one or more `memory_id`s. The prompt requires the model to emit answers as JSON with a `claims: [{text, citations: [memory_id]}]` array. Render claims as prose with **citation chips** that open the source capture drawer.
3. **Never speak as the creator.** System prompt forbids first-person impersonation. Answers refer to the creator in third person ("Your mother said…", not "I said…").
4. **No fabrication on the View side.** Same threshold + same JSON contract for nominees as for creators.

This is tested in `tests/grounding/` and `tests/prompt_injection/` (see handoff plan).

---

## 7. Tweak Points Discovered While Prototyping

Worth surfacing in `Heirloom Design System.html` for the next round of decisions:

- **Greeting time of day** - morning / evening (creator home)
- **Sealed-piece reveal** - titled vs blurred (nominee home)
- **Release framing language** - milestone / scheduled date / by request (nominee reveal)
- **Relationship word** - mother / father / partner / friend / grandparent (nominee reveal)
- **Capture chip layout** - 2×2 grid vs single horizontal row (deferred decision; 2×2 currently)
- **Latest-unlocked recency tag** - "2 days ago" / "3 weeks ago" / "6 months ago" (affects emotional cadence of the home)

---

## 8. Files this addendum applies to

- `Heirloom Design System.html` - add the three new prototype thumbnails + the four capture-mode patterns + executor-v1 note
- `DESIGN.md` - append §6–§10 mapping to the above
- All five prototype HTMLs continue to reflect this scope unchanged

## 9. Companion handoff docs

The eleven companion handoff docs live in `handoff/`: README, ARCHITECTURE, FLOWS, SCHEMA, API_CONTRACTS, SCREENS, PROMPTS, GUARDRAILS, PWA, MILESTONES, PROMPT_INJECTION_TESTS.

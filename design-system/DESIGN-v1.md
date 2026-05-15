# Heirloom - Design Addendum for v1

This file is the **delta** layered on top of `DESIGN.md` and `Heirloom Design System.html`. It captures the v1 build scope and the design patterns we resolved while building the prototypes (`prototypes/`).

> The product narrative is **local-first, on-device, your archive does not leave your machine.** Heirloom ships in three deployment shapes from the same Next.js codebase: laptop install via `./install.sh` (Postgres + pgvector + Ollama + whisper-cpp), single-VM self-host (`docs/DEPLOY-AZURE-VM.md`), and a Tauri-bundled macOS `.dmg` (SQLite + sqlite-vec, sidecars supervised by the shell). The TTS sidecar for voice cloning is opt-in on every shape.

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

### Shipped after the original v1 cut
- **Voice cloning / TTS** - LuxTTS/ZipVoice sidecar at `127.0.0.1:11435`, opt-in. The SpeakButton component plays verbatim source material (transcript snippets, sealed-letter bodies, citation snippets) in the creator's cloned voice. See `GUARDRAILS.md` §11.
- **Identity index** - hidden profile capture per vault so Reflection can answer identity queries without the creator writing those facts as a real note. Migration 006.
- **Web Push notifications** - sealed-letter unlocks + daily memory via VAPID; iOS PWA install required.
- **Encrypted .hloom export/import** - argon2id + ChaCha20-Poly1305 over a gzipped JSON envelope; settings → Vault.
- **macOS desktop bundle** - Tauri 2 shell, sidecars supervised, SQLite + sqlite-vec replacing Postgres.

### Out (designed, not built)
- **Executor Shamir 2-of-3** - the prototype stays as the post-launch narrative.
- **Annotate-back** (nominee writes a private response into their copy).
- **Multi-keeper recovery**.
- **In-app account deletion** - designed (7-day soft delete + confirmation phrase), not built.
- **Threads UI** - tables + RLS exist; no surface mounts them yet.
- **Saved passages UI** - same situation.
- **Video capture sheet** - chip is rendered disabled; API + pipeline handle `kind='video'`.

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

1. **Retrieve first.** Top-5 from pgvector. If best similarity < `REFLECTION_SIMILARITY_THRESHOLD` (currently 0.40, calibrated against EmbeddingGemma 300m), return the **empty state**: *"I don't have that in the archive. Try asking another way?"* - never synthesize.
2. **Synthesize with citations.** `streamObject` against the `ReflectionSchema` Zod schema. Every claim must cite at least one retrieved `capture_id`. Per-claim filter during streaming drops fabricated UUIDs silently; final validator catches anything else.
3. **Never speak as the creator.** `hasFirstPersonOutsideQuotes` runs on the final answer and routes first-person prose to the empty state. Quoted material is exempt - the creator's verbatim words may use "I".
4. **No fabrication on the View side.** Same threshold, same JSON contract. RLS narrows retrieval to released captures + the vault's identity-index profile capture (the only nominee read outside `nominee_releases`).

Implementation lives in `src/lib/reflection.ts` + `src/app/api/reflect/route.ts`. The corpus of adversarial questions to test against is in `design-system/handoff/PROMPT_INJECTION_TESTS.md`.

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

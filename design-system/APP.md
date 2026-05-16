# Heirloom - App Experience Specification

> A private, local-first legacy companion. This document is the canonical blueprint for the working app. Pair this with `DESIGN.md` (the visual system) and `Heirloom Design System.html` (the live system reference).

---

## 0 · v1 Framing

v1 ships the smallest, most honest version of Heirloom that proves the architecture: grounded, citation-bearing retrieval over a private archive, with a calm, ceremonial handoff to a nominee.

### Why Gemma 4 for this product

1. **Native multimodal** - one model can reason over the creator's voice recording, the photo they upload, the video clip, and the text journal entry without stitching together a separate pipeline for each modality.
2. **Function calling** - Reflection uses tool-use to call a local vector index (`retrieve_capture`, `quote_passage`, `list_captures_about`), which gives us a clean structural place to enforce grounding and citation.
3. **Model size range** - the larger variant handles long-context synthesis for Reflection; the smaller variant handles fast tagging and gentle follow-ups in parallel with capture commit.
4. **Local-first by design** - the product can run end-to-end against a local Ollama instance. A user can airplane-mode their laptop and the system still captures, retrieves, and reflects.

### The product narrative

```
A creator opens Heirloom. The seal. The page turn.
She speaks a memory. Waveform. Live transcription. A gentle follow-up suggestion appears.
She designates her daughter as nominee. Sets a release condition.
Years pass.
The daughter opens Heirloom. The sealed envelope. The seal breaks. The letter unfolds.
She asks: "What did mom think about leaving home for college?"
Reflection answers, grounded, with citation chips back to the exact captures.
Tagline: Preserve presence across generations.
```

Every screen in this document serves that narrative.

### v1 scope

**In scope:**
- Creator onboarding (3 screens)
- Capture studio - **audio first** (the most emotionally resonant modality), then note
- Memory card detail with transcript + Gemma-extracted tags
- Nominee designation + release condition
- Mode switcher (page-turn metaphor)
- Nominee sealed-letter reveal
- Reflection chat with citation chips
- Voice playback with "this is a recording" indicator

**Out of scope for v1 (designed, stub-able):**
- Photo / video capture modalities (designed, not implemented)
- Settings, privacy transparency view (designed, static screens fine)
- Voice cloning (consent flow designed; *not implemented* - ethically loaded, and not needed before the consent ceremony is itself test-driven)

---

## 1 · Architecture (the engineering brief)

### Local stack

```
┌─────────────────────────────────────────────────────────┐
│  Heirloom Desktop (Tauri or Electron)                   │
│  React + Vite UI ────────────────────────────────────── │
│                       │                                 │
│                       ▼                                 │
│  Local API (Rust/Tauri command or Node sidecar)         │
│      • capture ingest                                   │
│      • SQLite (metadata) + filesystem (media blobs)     │
│      • LanceDB / sqlite-vss (vector index)              │
│                       │                                 │
│                       ▼                                 │
│  Ollama (localhost:11434)                               │
│      • gemma4:26b   - vault / understanding / reflection│
│      • gemma4:e4b   - fast on-device companion          │
└─────────────────────────────────────────────────────────┘
```

Everything is on the user's machine. No cloud.

### Gemma 4 responsibilities

| Surface | Model | Mode |
|---|---|---|
| Audio transcription + emotional tagging | gemma4:26b | multimodal in, structured JSON out |
| Photo metadata extraction (place, people count, mood) | gemma4:26b | multimodal in, structured JSON out |
| Capture follow-up prompt suggestion | gemma4:e4b | text in, one short question out |
| Reflection chat (nominee Q&A over archive) | gemma4:26b | tool-use loop with `retrieve_capture`, `quote_passage`, `list_captures_about` |
| Survivor-sensitivity check before certain prompts | gemma4:e4b | quick classifier |

### Grounding contract (Safety & Trust track)

The Reflection model is wrapped in a **system prompt + tool harness** that enforces:

1. Every factual claim about the creator must come from a `quote_passage(...)` tool call.
2. The model cannot generate first-person statements *as* the creator. It speaks *about* the creator, paraphrasing only sparingly, and always offers to play the original audio.
3. If asked something the archive doesn't contain, the model must say so. No "best guess about what mom would think."
4. Every UI answer renders citation chips inline. Removing chips from the response would be a bug.

This contract is the safety story of the product, and the UI **visually surfaces** that contract (citation chips, "play original" buttons, "not in the archive" empty states).

### Release-condition triggers

The handoff system supports three release modes - **none defaults to "after death"**:

1. **Released by creator** - manual unlock during creator's lifetime.
2. **Scheduled date / milestone** - calendar date (birthday, anniversary, 18th birthday). Fires locally; if device offline, fires on next launch.
3. **Executor key** - a trusted person holds an envelope with a passphrase. Passphrase entry unlocks. (Not "death certificate"; we never make that the literal mechanism - too clinical and legally fraught for an MVP.)

Each release mode has a distinct UI treatment (see Nominee designation flow).

---

## 2 · Information Architecture

### Creator mode (visible only to the creator)
```
Home
├── Capture            ← record / upload / guided prompt
├── Explore            ← search & retrieve (timeline + grid + map-of-themes)
├── Reflection         ← chat with the archive (creator self-reflection)
├── Nominees           ← who receives what, when
└── Settings           ← privacy, storage, mode switcher, voice consent
```

### View mode (what a nominee sees)
```
Home (cinematic intro on first visit, quieter on return)
├── Explore            ← same retrieval surface, no capture affordances
├── Reflection         ← grounded Q&A (the killer surface)
└── About              ← who Heirloom is to them; release context; creator's note
```

**Mode switcher** is visible only to Creators (a small toggle in the chrome). The visual metaphor is **page-turn** - see Design System for the animation. Mode switch is not a settings toggle; it's a *state of presence*, treated with weight.

---

## 3 · Onboarding - Creator (the most important flow to nail)

The onboarding has to do three jobs gently:
1. Establish trust (this is local, this is yours, no one sees it).
2. Establish *purpose* (who is this for; we don't assume death).
3. Get the user to their **first capture within 90 seconds**, without rushing them.

### Screen 1 · The portal

- **Background**: cream paper, full bleed, very subtle texture.
- **Composition**: the wax seal centered, slightly above center. Below it, in serif: **Heirloom**. Below that, in body sans, slightly muted: *Preserve presence across generations.*
- **Single action**: a soft, low-contrast button: *Begin a new archive* - and a smaller link: *I have a sealed letter* (routes to nominee entry).
- **Footer**, monospaced micro-text: `Local-first · Nothing leaves this device.`
- No sign-up. No email. No account. The vault is created on-device; an optional passphrase is set on next screen.

### Screen 2 · The vault passphrase

- Heading: *Set a passphrase for this archive.*
- Subheading (smaller, calm): *This unlocks the vault on this device. We don't have a copy - if you lose it, you lose the archive. Write it somewhere safe.*
- Input field, large, serif-styled.
- Below: a checkbox: *Allow biometric unlock on this device.* (Touch ID / Windows Hello.)
- Footer: a small *Skip - I'll set this later* link. (Sets a temporary blank passphrase; warning surfaces in Settings.)

### Screen 3 · Who is this for?

This screen is the **emotional core of onboarding**. It explicitly does *not* ask "are you dying." It asks who the archive is for.

- Heading: *Who do you want to reach?*
- Subheading: *You can change this anytime. You can add more people later.*
- Three soft cards (single-select to start, but visually look like they're saying "any of these is fine"):
  1. *Someone specific I love* - partner, child, parent, friend, sibling
  2. *Future versions of people I love* - children not yet grown, family not yet born
  3. *I'm not sure yet - I just want to start*
- A fourth, smaller link below: *I'm preserving someone else's stories with their consent* - branches to a caregiver onboarding variant (out of scope for v1; designed only).

### Screen 4 · The first prompt

- A serif heading, large: *Let's start with one memory.*
- Body sans, smaller: *Speak it, write it, or upload it. There's no length, no structure. You're not performing.*
- Three soft tiles, each opens the capture studio in that modality: **Speak** · **Write** · **Upload**
- Below: a single suggested prompt, rotating: *"The first time you remember feeling proud of yourself."* / *"A small thing you do that no one else knows about."* / *"What you want them to know when they're tired."*
- A small link: *I want to choose a prompt → Prompt library*

### Screen 5 · Capture (audio default) - see §4

After the user finishes their first capture, the **post-capture state** does three things:
1. Shows the transcript with Gemma-extracted emotional tags as chips (soft, removable).
2. Shows one gentle follow-up suggested by Gemma 4: *"You mentioned your mother in this - would you like to record something just about her, while it's fresh?"*
3. Offers two equal-weight buttons: *Save and rest* · *Record one more*

The follow-up suggestion is the moment we earn the "AI helps you go deeper" story. It must feel like a careful interviewer, not a productivity nudge.

### Onboarding completion

After the first save:
- A **quiet** confirmation. No confetti, no checkmarks. Just: *Saved. This is the beginning.*
- The user lands on **Home** in Creator mode. Home shows: the seal (now smaller, top-left), a single card representing their first memory, a soft prompt to *Add someone who will receive these* (the Nominees flow), and the chrome.

**Total time-to-first-value**: < 90 seconds if the user speaks, < 3 minutes if they type.

---

## 4 · Capture Studio

The single most-touched surface in the product. Must feel calm, not clinical.

### Layout (mobile-first, scales to desktop)

```
┌─────────────────────────────────────────┐
│ ← back                          ⏸  ⋯    │
│                                         │
│   [ prompt text, serif, large ]         │
│   [ optional context: "for Maya" ]      │
│                                         │
│                                         │
│        ┌─────────────────────┐          │
│        │   waveform area     │          │
│        │   (live, generous)  │          │
│        └─────────────────────┘          │
│                                         │
│              [ 02:14 ]                  │
│                                         │
│         ●  record / pause               │
│       small: cancel · done              │
│                                         │
│   transcript appears below, live,       │
│   in serif, dim, as it streams          │
│                                         │
└─────────────────────────────────────────┘
```

### States

| State | UI |
|---|---|
| Idle (just opened) | waveform is a single flat line, faint. Record button pulses *very* slowly. |
| Recording | waveform is live and warm-colored. Counter ticks. Transcript streams below in a muted serif. |
| Paused | waveform freezes mid-pose. *Resume* button. Discrete *Add a note* affordance. |
| Done | waveform locks into a final shape (becomes the memory card's signature). Post-capture screen takes over. |
| Sensitivity branch | If Gemma flags survivor-sensitive content (e.g., the user mentions a deceased child unprompted), a *very* soft inline note: *"This sounds like it matters. Would you like to keep going, or pause for a moment?"* with two equally-weighted options. Never gates. |

### The "ask about survivors / loved ones" branching

This is a delicate moment from the brief. The mechanic:

1. When the user picks certain prompts (e.g., "What I want them to know when they're tired"), Heirloom asks first, *inline as part of the prompt screen, not modally*:
   > *Before we begin - is there a specific person you're speaking to? You don't have to name them. We just want to follow your lead.*
   - Three options, soft chips: *Someone in particular · A group · I'd rather not say*
2. The answer threads into the capture - the prompt header silently updates to *"…for Maya"* if applicable.
3. Gemma uses this context for follow-up suggestions but **never volunteers the name back** in a way that could feel like a séance.

### Modalities (audio is built; others are designed)

- **Speak** (built) - described above.
- **Write** - full-bleed serif textarea, no toolbar, no formatting chrome. Auto-save every keystroke to local. A single soft prompt at the top, dismissable. Voice-to-text toggle in the corner.
- **Upload - photo** - drag-drop zone. On drop, Gemma extracts a structured object: place hint, approximate date, people count, mood adjective. Each surfaces as an editable chip. The photo becomes the card's hero.
- **Upload - video** - same as photo plus scene chapter detection (Gemma 4 native video understanding). Chapters render as a small timeline on the card.

---

## 5 · Memory Card Detail

A single memory is rendered as a **card** with the following anatomy:

```
┌─────────────────────────────────────────┐
│ [ hero region - varies by modality ]    │
│   • audio: waveform signature           │
│   • photo: full image                   │
│   • video: poster frame + chapter rail  │
│   • journal: a single pull-quote        │
│                                         │
│ [ date, in monospace, small ]           │
│                                         │
│ [ title - short, serif, large ]         │
│ [ optional addressee - "for Maya" ]     │
│                                         │
│ [ tag chips - emotional, removable ]    │
│                                         │
│ [ transcript / body - serif, generous ] │
│                                         │
│ [ "play original" button if audio/video]│
│   [ ░ this is a recording ░ ]           │
│                                         │
│ [ related captures - small thumbnails ] │
└─────────────────────────────────────────┘
```

**Rules:**
- The "this is a recording" indicator on audio/video is **always visible** during playback. It is small, but it is not optional. This is the ethical promise from the brief.
- Tags are author-editable. Gemma's suggestions are clearly marked as such (a tiny dotted underline) until confirmed.
- "Related captures" is a Gemma-driven affordance using the vector index. Limit to 3, never more - we are not building Spotify.

---

## 6 · Explore (Retrieval)

The retrieval surface lives in both Creator and View modes; affordances differ only by mode.

### Three lenses

1. **Timeline** - vertical, slow scroll. Years as serif markers; months as monospaced subdivisions. Cards are full-width and breathe. This is the default lens.
2. **Grid** - for visual scanners. Honeycomb-ish irregular grid (think Pinterest, calmed down). Photos dominate visually; audio cards show their waveform signature.
3. **Themes** - Gemma-derived thematic clusters: *Mornings · Your hands · Things you said about courage · Letters to Maya · Songs.* Each theme is a soft pill at the top of the screen; tapping enters a curated view.

### Search

A single serif search field at the top: *What are you looking for?* (Note: not "Search". Search is for files; this is for memory.)

Behind the field, Gemma performs hybrid retrieval (BM25 + vector). Results render as cards with **highlight chips** showing the matched span. Every result is clickable to its source capture.

---

## 7 · Reflection (the central retrieval surface)

Reflection is a chat interface - but it is *not* ChatGPT. The visual treatment makes the difference.

### Visual

- Full-bleed cream background, no chat bubbles.
- The user's question renders right-aligned, small, serif italic, muted.
- The answer renders left-aligned, **serif body type, generous**, like reading a letter.
- Citation chips render inline within the answer, as monospaced superscripts: ¹ ² ³. Tapping/hovering expands the cited capture in a side rail.
- A persistent **"play the original"** button below any answer that quoted audio/video.
- The composer at the bottom is a single line, low-contrast, no send button - just *Enter*. Voice-input toggle to the left.

### Behavior (the grounding contract, made visible)

- Every answer ends with a thin rule and a footer: *Drawn from 3 captures · Jan 2026 – Mar 2027 · Tap to view sources.*
- If the archive doesn't contain an answer, the response is explicit and quiet:
  > *I don't have anything in the archive that speaks to this. You could ask differently, or this might be a question they never put into words.*
- Crucially: **no "as your mother, I would say…"** Ever. The model is wrapped to refuse first-person impersonation. If a user explicitly asks "what would she say?", Reflection responds with the closest *actual quote*:
  > *She didn't answer this directly, but in a recording from March 2026 she said: "..." That's the nearest thing in the archive.*

### Empty Reflection (the brief's "emotional fingerprint" question)

When a nominee first arrives in Reflection with no question typed:
- The page is mostly empty - just the seal small in the corner.
- A single softly-rendered line in serif italic, centered: *"Ask anything. The archive will answer with their own words, or it won't answer at all."*
- Below, three faintly-rendered example questions, each one tailored from the actual archive (Gemma generates them client-side based on the corpus):
  - *What did she say about leaving home?*
  - *Tell me about the year I was born.*
  - *Was there a song?*

These three questions are the "emotional fingerprint" - they are *generated from the archive*, not from a template. The nominee feels seen on first touch.

---

## 8 · Nominees & Handoff

### Creator side - Nominee designation

A "Nominees" surface lists each designated recipient as a row:

```
┌─────────────────────────────────────────────────────────┐
│ ◐ Maya - daughter           Release: her 18th birthday  │
│   24 captures shared · 6 held back  ·   Edit  ▸         │
├─────────────────────────────────────────────────────────┤
│ ◐ Sam - partner             Release: any time           │
│   All captures shared            ·   Edit  ▸            │
├─────────────────────────────────────────────────────────┤
│ + Add a nominee                                         │
└─────────────────────────────────────────────────────────┘
```

Editing a nominee opens a modal-but-not-clinical drawer with:

1. **Name & relationship** - soft fields.
2. **What they receive** - *Everything tagged for them* (default) · *Curated set* (manual list) · *Everything except* (subtraction list).
3. **When they receive it** - one of three:
   - *Anytime - they can ask for it whenever they want.* (You hold the passphrase to release.)
   - *On a date or milestone.* - calendar picker with milestone presets (birthdays, anniversaries).
   - *Through a trusted person.* - generates a passphrase printout. Hand it to your chosen executor in person. Includes guidance text on the printout itself.
4. **How they're contacted** - *Email · Printed letter · No contact (they will be told another way)*. Heirloom never emails. The user prints the letter themselves. (This avoids account systems and aligns with local-first.)

### Nominee side - The sealed-letter reveal

This is the second-most-important moment in the product (after first capture). Designed to feel like opening a real letter.

#### Entry

The nominee receives (offline, by post or in person) a printed card with:
- A short serif headline: *Maya - there is something here for you.*
- A URL to a local-first viewer (Heirloom's nominee site, served from the creator's exported archive or a self-hosted instance).
- A passphrase, monospaced, printed in 14pt with generous spacing.
- A small line at the bottom: *This was prepared by [Creator name]. There is no rush.*

#### Screen 1 · The envelope

- Full-bleed cream paper. Centered: a closed envelope, photographed on paper, with the wax seal pressed onto it. Subtle drop shadow. **No animation yet.**
- Below: *A passphrase, please.* Single input, serif, large. No "remember me." No social.
- Footer: *This is local to your device. Nothing is sent.*

#### Screen 2 · The break of the seal

- On correct passphrase: the seal **breaks** - a single, deliberate animation, ~1.6 seconds, no sparkle. The two halves of the wax fall slightly apart. The envelope opens.
- A single line of serif appears: *[Creator name] left this for you.*
- Below: *Released on [milestone or date], or by your request.* - context-dependent.
- A single button: *Begin.*

#### Screen 3 · The introduction (cinematic intro, once)

- A slow vertical scroll, full-bleed, no chrome. Each section is one breath.
  - The creator's name and dates (if applicable, framed gently - not as obituary).
  - A short note the creator wrote *to this nominee* during onboarding (max 280 chars).
  - The number of captures, the date range.
  - A single button: *Enter the archive.*

#### Screen 4 · Home (View mode)

Same chrome as Creator Home but without Capture affordances. The first card is a *recommended starting point* selected by Gemma - usually the creator's introductory recording, if one exists. Otherwise the earliest joyful capture.

#### Subsequent visits

After the first visit, the envelope/seal does not replay. The nominee lands directly on Home. The seal moves to the top-left corner as the persistent brand mark - quiet now, but still present.

---

## 9 · Voice playback (the ethical promise made visible)

Whenever audio plays:

- Top of the player: a single line of monospaced text, dim: `recording · [date]`
- The waveform animates with the playback head - but the **head moves left-to-right, not bidirectionally**, to reinforce "this is fixed in time."
- Below the player: a transcript syncs word-by-word, dimming past words.
- A small *Original speed* label sits next to the playback control. Speed adjustment is allowed (0.75× / 1× / 1.25×) but not pitch-shift - preserving voice integrity.

There are no avatars. No animated face. No "they are speaking to you now." The recording was made on a real day, and we treat it that way.

---

## 10 · Mode switcher

The toggle is a small element in the top-right chrome, visible only in Creator mode:

```
[ Create  ◐  View ]
```

Tapping triggers a **page-turn** animation (~700ms), the same metaphor used elsewhere. The whole UI passes through the turn - chrome included. On the other side, the Creator's Capture surfaces are gone. The user lands on whatever the nominee would land on, with a small floating *Return to Create* pill in the corner. Tapping the pill turns the page back.

This is the cleanest answer to "what does mode switch feel like." It is the same gesture as opening a book. It does not feel like an admin toggle.

---

## 11 · Settings & privacy transparency

A single Settings surface, scrollable, with these sections:

1. **This archive** - name it, change passphrase, set biometric, export, destroy.
2. **Storage** - local path, total size, per-modality breakdown. A reassuring sentence: *Nothing here has ever left this device. We will tell you if that changes - it never will without your explicit action.*
3. **Voice consent** - toggles for whether voice-cloning is **even technically permitted** on this archive. Default: **off**. If on, the user must record a consent statement aloud reading a specific phrase. (Designed; not built in v1.)
4. **Nominees** - link out to the Nominees surface.
5. **About this build** - Gemma 4 version, Ollama version, last update. Includes a *Verify offline* button that disables network and confirms everything still works.

The **Verify offline** button is a small but powerful UX moment - it makes our local-first claim falsifiable.

---

## 12 · Component reference

All components are specified visually in `Heirloom Design System.html`. This section maps each design-system component to the screens that use it:

| Component | Used in |
|---|---|
| Wax seal mark | Portal, Home (small), Nominee envelope, sealed-letter break |
| Memory card (5 variants) | Home, Explore, Reflection citations |
| Citation chip | Reflection answers, search results |
| Voice waveform player | Capture studio, Memory card detail, Reflection |
| Guided prompt block | Capture studio header, Home suggestions |
| Mode switcher pill | Creator chrome |
| Nominee row | Nominees surface |
| Handoff status pill | Nominee row, Nominee designation modal |
| Audio recorder | Capture studio |
| Photo uploader with metadata preview | Capture studio (photo modality) |
| Video player with chapter rail | Memory card detail (video), Reflection citations |
| Timeline navigation | Explore (timeline lens) |
| Emotional tag chip | Memory card detail, Capture post-state |
| Sealed-letter envelope | Nominee entry screens |
| Page-turn transition | Mode switcher, sealed-letter break, between cinematic intro sections |

---

## 13 · Copy & voice guide

Heirloom's copy is **serif-paced**, even when set in sans. It reads like a thoughtful friend, not a product.

### Voice rules

- **Never use "AI"** in user-facing copy. The model exists; we do not advertise it. If we must reference it, say *Heirloom* or *this app*.
- **Never use exclamation points.** Not once.
- **Never use emojis** except where explicitly part of a creator's own content (e.g., they put one in a journal entry).
- **No urgency, ever.** Nothing "expires." Nothing is "limited." There is no streak.
- **No bereavement assumptions.** Captures may be released long before death; copy must work in all release modes.
- **Long sentences are okay.** A serif typeface earns them.

### Word swaps

| Don't | Do |
|---|---|
| Sign up / Log in | Begin a new archive / Open this archive |
| Memory bank, library | Archive |
| Posts, entries | Captures, memories |
| Recipients, contacts | Nominees, the people who'll receive these |
| Recordings (when shown live) | Already a recording from [date] |
| Deceased, passed, lost | (Avoid in product copy. The product does not need to refer to death directly.) |
| AI, model, prompt | (Hide. The user is talking to Heirloom, not a model.) |

### Sample microcopy bank

- **Capture save**: *Saved. This is the beginning.*
- **Capture save (later)**: *Saved. There are now {n} captures in this archive.*
- **Empty Reflection**: *Ask anything. The archive will answer with their own words, or it won't answer at all.*
- **Reflection - no result**: *I don't have anything in the archive that speaks to this.*
- **Nominee release set**: *Set. When the time comes, Heirloom will be ready.*
- **First nominee added**: *{Name} is now part of this archive. You can keep building. You can stop. Both are fine.*
- **Verify offline complete**: *Confirmed. Everything you've made works without a network.*
- **Settings → destroy archive**: *This will erase every capture, transcript, and tag on this device. There is no undo and no backup. Are you certain?*

---

## 14 · Motion & feel

Three motion primitives only. Everything else is fade.

1. **Page-turn** - used for mode switch and sealed-letter break. 700ms, eased, no bounce. The page lifts from the right, curls, and reveals the next surface. (Implementation: CSS 3D transform on a flat plane, or a pre-rendered Lottie if performance matters.)
2. **Soft fade** - 240ms ease-in-out, the default for everything else.
3. **Waveform breathing** - the recording-idle waveform pulses at human-breath pace (~12 breaths/min). When recording, it's reactive. This is the only "live" motion in the product.

No spring animations. No springs. No bouncy CSS easings. The product is calm.

---

## 15 · Stack & seed data

The stack as it actually ships:

- **Shell**: Next.js 16 (App Router, RSC, Turbopack) as an installable PWA. The macOS .dmg wraps the same code in a Tauri 2 shell with bundled Ollama + Node + whisper-cli sidecars; the embedded server runs at `127.0.0.1:3000` inside the .app. See `desktop/README.md`.
- **UI**: React + Tailwind v4 (with custom `@theme static` tokens for the warm-paper palette), Framer Motion.
- **Inference**: Ollama hosting `gemma4:e4b` (synthesis + vision + tagging) and `embeddinggemma` (768-dim embeddings); a custom `heirloom/gemma4-grounded` Modelfile bakes the grounding contract. Whisper-cpp `small.en` runs as a subprocess for audio transcription.
- **Voice cloning** (opt-in): LuxTTS/ZipVoice FastAPI sidecar at `127.0.0.1:11435`. See `infra/tts-server/`.
- **Storage**: Postgres 16 + pgvector on the laptop install + the VM; SQLite + sqlite-vec inside the .dmg. Audio/photo/video blobs sit on local disk (`storage/blobs/`).
- **Audio**: browser `MediaRecorder` API; the canonical wav-encoding helper is `webmBlobToWav` in `src/lib/voice-record.ts`.
- **Face recognition**: face-api.js in the browser, 128-dim ResNet descriptors. Faces never leave the device.

### Seed archives

Canonical demo archive is **Carl Sagan** (`desktop/seed-archives/sagan/`): 4 notes (Pale Blue Dot, Star Stuff, Way of Thinking, On Apollo), 3 photos, 1 sealed letter ("When you feel insignificant"), 1 framing letter. The importer is `desktop/scripts/import-seed-archive.ts`. Passphrase convention: `<slug(creator name)> archive · 1990`. Voice references in seed archives are placeholders unless replaced.

The corpus exercises the full retrieval and grounding contract - topics Reflection can ground (Pale Blue Dot, star stuff, science as a way of thinking) and topics it cannot (Antarctica, will, favorite poem) so the empty-state path is exercised on real questions.

### Risks & mitigations

| Risk | Mitigation |
|---|---|
| Reflection generates a quote not present in retrieval | The citation validator + per-claim filter + first-person scrubber collapse any failure to the empty state. See `src/lib/reflection.ts`. |
| CPU inference is slow on a VM | Capture pipeline marks `status='ready'` before the slow tag/title Gemma calls so the user sees "Saved" in 1-2 s. Reflection emits `answer_partial` SSE events so the user sees words forming rather than a long stare. `ollama-warmup.service` pre-warms the model at boot. |
| Voice cloning could speak Gemma prose | UI-layer contract: `<SpeakButton>` is only mounted over verbatim source material (capture body / transcript / sealed-letter body / citation snippet). Reflection answer text never gets a speak affordance. See `GUARDRAILS.md` §11. |
| Wax-seal animation feels artificial | CSS keyframes; same end-state regardless of perf. `/dev` exposes a `?stage=` query param so the animation can be debugged frame-by-frame. |

---

## 16 · What we are NOT designing

A reminder of the brief's anti-patterns. Every design decision below is forbidden by Heirloom:

- AI bot avatars, sparkles, orbs, neon, gradients on AI surfaces
- Engagement loops: streaks, badges, "you have 3 unread memories"
- Social: comments, reactions, sharing to external platforms
- Notifications that personify the creator ("Mom wants to tell you something today")
- Animated avatars of the creator
- "Memorial" framing in any default copy
- Productivity-app density
- ChatGPT chrome on Reflection
- Onboarding that asks medical questions
- Sign-up walls, account creation, "verify your email"

---

## 17 · Open questions for the next pass

These are the design problems flagged in the brief that this document **proposes initial answers to** but that should be re-examined as we prototype:

1. **Page-turn vs. dissolve for mode switch** - current proposal: page-turn. Stress-test on touch devices.
2. **Whether the "ask about survivors" branch should ever be skipped** for users who explicitly indicate they want unprompted capture. Currently: yes, the branch hides after the user dismisses it twice.
3. **Voice-clone consent flow** - designed but not built. The ethical surface is heavier than the engineering surface. Deferred past v1.
4. **Executor-key release mechanics** - current proposal: printed passphrase + chosen trusted person. Alternative: Shamir secret-shared keys across multiple holders. Deferred past v1.
5. **"This is a recording" indicator placement during long listening sessions** - current placement is top of player; if it becomes fatiguing, move to a subtle persistent watermark on the player chrome.

---

*This document is the source of truth for the working app. If a future change conflicts with what's here, update this doc as part of the same change.*

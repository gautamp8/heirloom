# Heirloom - Design System

> _Preserve presence across generations._

Heirloom is a private, local-first legacy companion. It carries stories, voice, memories, and values across generations, on the creator's terms. This document is the canonical reference for tokens, type, color, components, motion, voice, and the ethical lines the design must hold.

The interactive companion to this file is **`Heirloom Design System.html`**. Open it for live specimens, swatches, the logo gallery, and the Tweaks panel that lets you swap palettes, type pairings, mode-switch metaphors, and handoff treatments.

---

## 1. Direction (committed)

| Axis | Decision | Notes |
|------|----------|-------|
| Aesthetic | **Warm Paper** - bone, ivory, parchment, sepia ink, wax | One ceremonial accent (oxblood), one warm secondary (candle-amber) |
| Type | **Newsreader** (display + italic voice) · **Geist** (UI) · **JetBrains Mono** (metadata) | Newsreader italics carry intimacy; Geist keeps chrome modern |
| Logo | **Wax-seal monogram H** (primary) + wordmark + lockup | Three additional explorations available in the gallery |
| Motion | **Restrained baseline · cinematic threshold moments** | Three sanctioned cinematic moments - see §6 |
| Imagery | **Atmospheric, not stock-people** | Window, hand, kitchen - never collaged faces |
| Mode-switch metaphor | **Turning a page** | A page lifts from left; the View room sits underneath |
| Handoff metaphor | **Wax seal on a folded letter** | The single ceremony shared by death · milestone · creator release |
| Voice-clone | **Surfaced feature, multi-step consent ceremony** | Never default-on; revocable at any point |
| Device priority | **Responsive - mobile and desktop equal** | Mobile-first capture; desktop for retrieval and archive review |

### Things this design is **not**

- ChatGPT chrome
- Dashboard / SaaS density
- Neon AI accents, sparkles, orbs, gradients, AI-bot mascots
- Productivity-app density
- Social-network engagement loops
- Aging-services product visual coding (silver, large fonts as accessibility tell)

---

## 2. Brand voice - one paragraph

Heirloom is a held space. We speak softly, in first-person plural ("we"), and we never personify the creator. Prompts ask, they don't direct. Errors apologize without flourish. We say _released_, not _unlocked_; _held_, not _queued_; _opened_, not _viewed_. We always use the names the creator gave us. If we don't know a name, we ask. If asking would intrude, we wait.

A fuller voice & tone reference (do / don't, words we use, words we avoid) lives in §7 of the interactive system.

---

## 3. Color

### Palette - Warm Paper (canonical)

| Token | Hex | Role |
|---|---|---|
| `--bone` | `#FAF7F0` | Page background; the canvas |
| `--bg-raised` | `#FFFDF7` | A piece of paper resting on the canvas |
| `--ivory` | `#F2ECDD` | Sunken surfaces; inputs; the Reflection field |
| `--parchment` | `#E8DFC8` | Deeper sunken; capture-studio backdrop |
| `--vellum` | `#D8CBA8` | Image placeholder background |
| `--rule` | `#C7BB9B` | Strong dividing rules |
| `--ink-deep` | `#1F1B14` | Body text; primary glyphs |
| `--ink-soft` | `#3C3324` | Secondary text |
| `--ink-mute` | `#766A4F` | Helper, meta-label color |
| `--ink-fade` | `#9C9075` | Mono caption color |
| `--sepia` | `#5C3A21` | Quoted voice; dates; the historical register |
| `--wax` | `#7D2A1A` | **Ceremonial accent** - Record, Designate, Release |
| `--wax-soft` | `#A23F2A` | Hover / secondary ceremonial |
| `--candle` | `#C9892A` | Warm secondary - image tint, timestamps |
| `--moss` | `#5F6B43` | Tertiary - the living thing; success-ish |

### Alternative palettes (tweakable)

- **Cool Archive** - fog, slate, deep navy, candle accent
- **Garden Pressed** - sage, dried-rose, dusk
- **Monochrome + one** - near-black on near-white with a single wax accent

### Restraint rules

1. Wax appears at most **once per screen**, never on routine actions.
2. Candle warms imagery & timestamps; never primary action.
3. No gradients except (a) the seal itself, (b) one Ken-Burns light wash on memory imagery.
4. Saturation ceiling for whites: chroma ≤ 0.02 (oklch).
5. **Pure black is forbidden.** Use `--ink-deep` (#1F1B14).

---

## 4. Typography

| Family | Use | Source |
|---|---|---|
| **Newsreader** | Display, headlines, prompts, quotes, emotional tags | Google Fonts |
| **Geist** | UI - buttons, fields, body, helper, labels | Google Fonts |
| **JetBrains Mono** | Timestamps, provenance, technical metadata only | Google Fonts |

### Scale (responsive, clamped)

| Token | Use | Spec |
|---|---|---|
| `--t-display` | Cover / first capture moment | Newsreader 200 italic, clamp(44, 7vw, 96) |
| `--t-h1` | Section headlines | Newsreader 300, clamp(34, 4.4vw, 56) |
| `--t-h2` | Subsection | Newsreader 300, clamp(26, 3vw, 38) |
| `--t-h3` | Card / object titles | Newsreader 400, clamp(20, 1.8vw, 24) |
| Quote / prompt | Capture prompts, pulled quotes | Newsreader 300 italic, 28 / 1.35 |
| Body | Reading | Geist 400, 16.5 / 1.55, max 62ch |
| Small | Helper, fine print | Geist 400, 13.5 / 1.45 |
| Meta | Timestamps, provenance | JetBrains Mono 11.5, .12em tracking, UPPERCASE |
| Eyebrow | Section labels | JetBrains Mono 11, .18em tracking, UPPERCASE |

### Voice register & font

- **The creator's words** → Newsreader **italic**.
- **The product's words** (UI labels, helper) → Geist.
- **Provenance** (dates, devices, "Local only") → JetBrains Mono uppercase.

---

## 5. Components

Reference renders live in the interactive system. Specs:

### Buttons
- **Primary** - wax background, bone text; **reserved for ceremonial actions**: Record, Designate, Release, Confirm release.
- **Secondary** - bone background, deep-ink text, hairline border.
- **Ghost** - transparent, fades into background on hover.
- All buttons are pill-shaped (`--r-pill`), 12/18 padding default, 8/14 for `btn-sm`.

### Chips
- **Default** - ivory background, hairline border. Geist 12.5.
- **Emotion** - transparent, hairline border, Newsreader italic, lowercase, sepia. Always in the creator's own words.
- **Citation** - mono, hairline border, used to deep-link to source memories.

### Fields
- Ivory background, hairline border, 14/16 padding.
- Geist 15. No floating labels.

### Memory cards
Variants: **audio · photo · journal · video · chat**. Each card has:
- An image slot (4:3) - either real imagery or a tinted placeholder
- Newsreader title (22)
- Italic excerpt - the creator's own words, pulled from the recording
- Kind chip + date in mono

### Waveform player
- 36 bars, 2px wide, paper-ink color
- The "now" position is the only place wax appears in routine playback
- **Always** carries a "recording" label - never reads as live presence

### Recorder
- Newsreader italic prompt (24/1.35), with a mono eyebrow naming the source ("Guided prompt · for Maren")
- Mic button: 64px circle, hairline border, wax glyph, soft halo
- A `Local only` indicator always visible
- The "ask about survivors" gentle prompt sits below the controls, not as a gate

### Nominees row
- 42px wax seal monogram of the nominee's first initial
- Newsreader name + meta-line describing the trigger ("Daughter · on her 18th birthday")
- Status chip with a small colored dot - `Held` (moss), `Ready to release` (candle), `Sealed` (fade), `Released` (wax)

### Voice-clone consent
A four-step ceremony, not a checkbox. Each step is a separate surface:
1. What a clone is, in plain words ("A clone is a recording that can be re-arranged")
2. What it will and will not do (read your writing; **never** invent new sentences)
3. Who can use it, and when
4. Confirm with voice (the creator says a sentence; we keep that sentence)

The clone is revocable at any point, including after handoff. Revocation is one button, not a dialog tree.

---

## 6. Motion

Routine motion is barely-there. Ceremonial motion is reserved for three thresholds.

### Durations
- `--dur-quick` 240ms - routine
- `--dur-calm` 520ms - transitions
- `--dur-cinema` 1100ms - thresholds

### Easings
- `--ease-paper` `cubic-bezier(.22,.61,.36,1)` - soft, like paper settling
- `--ease-fold` `cubic-bezier(.55,.05,.25,1)` - initial resistance, then release

### Sanctioned cinematic moments

1. **First capture, ever** - the recorder rises from the bottom of the screen on a 1100ms fold; the first prompt fades in 200ms behind it.
2. **Mode switch** - a page lifts from the left edge and rotates 168° on `--ease-fold`. The View room sits underneath in a quieter parchment.
3. **Nominee first opening** - the envelope sits closed. The wax seal "breaks" on a held interaction (long-press or sustained click) - never on an idle timer. The contents fade in over 1100ms.

### Forbidden

- Bouncing springs
- Particle / orb backgrounds
- Pulsing or breathing avatars representing the creator
- Typewriter effects on the creator's own voice
- Idle ambient motion behind handoff content
- Proactive "memory of the day" pop-ins

---

## 7. Iconography

A minimal custom set on a 20-unit grid. Single-weight stroke (1.2px), rounded caps, never filled. Asymmetric where the world is - the letter, the leaf, the thread.

Set: `mic · photo · journal · video · letter · seal · thread · clock · nominee · lock · search · leaf`.

Add only when an existing icon cannot carry the meaning. Lucide and similar default icon sets are off-limits - Heirloom's iconography must feel hand-set.

---

## 8. Imagery

### Stance
Atmospheric, not stock-people. Windows. Hands. A back of a head. A kitchen at the end of the day.

### Casting guidance
When commissioning or curating:
- Show the **full age range**. A thirty-year-old recording at a kitchen table. A parent in their forties on a porch. A grandparent at a sewing machine.
- **Never default to "an elder."** Heirloom is not an aging-services product and the imagery cannot suggest it is.
- Avoid grief-coded imagery (candles being blown out, empty chairs, photographs face-down) unless the creator has explicitly framed a memory that way.

### Placeholder system
Until imagery exists, use tinted rectangles with a small monospace caption naming what the image is meant to be - "A window · morning", "A hand · loose grip". This reads as reserved space, not filler.

---

## 9. Privacy as a surface

Local-first must be **visible**, not just true.

- Every capture surface shows a `Local only` indicator.
- Encrypted backup (if enabled) is labeled with the destination ("on this device", "Backup · 2 devices").
- Cloud sync is described in the present tense and can be turned off without orphaning anything.
- Voice clones are off by default and re-confirmed at handoff.

Revocation surfaces are first-class:
- A nominee can be unbound.
- A voice clone can be revoked.
- A released memory can be re-sealed.

Heirloom never makes any of these irreversible.

---

## 10. Ethical guardrails (UI-binding)

1. **View mode never visualises the creator as still here.** No animated avatars, no real-time presence indicators, no idle motion that implies breathing or attention.
2. **Voice playback always indicates this is a recording.** The waveform itself carries the label; the play-state never shows a "live" cue.
3. **The handoff never assumes bereavement.** Receiving contexts are three: creator-released, scheduled (milestone), or after the creator's lifetime. The same envelope + seal accommodates all three; the creator chooses the inscription.
4. **No proactive notifications that personify the creator.** A reminder may say "Held for Maren." It will never say "Mom would like to share something."
5. **The 'ask about survivors' branch in capture is gentle, not gating.** It surfaces below the recorder, with a quiet "Yes, gently" / "Not now". The default is _ask_, but the creator can dismiss without losing momentum.
6. **Mode-switch is creator-only.** Nominees never enter Create. The switcher is invisible to them.

---

## 11. Information architecture

### Create mode (creator-only)
`Home · Capture · Explore · Reflection · Nominees · Settings`

### View mode (nominees; also creator preview)
`Home (cinematic intro on first visit) · Explore · Reflection · About`
- No capture surfaces visible.
- No mode switcher.
- "About" frames who Heirloom is to this particular nominee, in the creator's words.

---

## 12. Screens to design (next phase)

Hero flows that will become interactive prototypes:

1. **Creator onboarding → first capture** - naming Heirloom, designating a first nominee (optional, can be skipped), the first guided prompt, the first recording.
2. **Nominee first-visit sealed-letter reveal → first playback** - the envelope, the seal, the first opening, the first recording played in View mode.

Single-screen mocks needed for the foundation deck:

`Creator home · Capture studio (audio / photo / video / text) · Memory card detail · Timeline · Explore (with citation chips) · Reflection · Voice playback · Mode switcher · Nominee handoff · Empty / loading / error · Settings · Privacy view`.

---

## 13. Tokens - quick reference

```
--bone       #FAF7F0   --ivory      #F2ECDD   --parchment  #E8DFC8
--vellum     #D8CBA8   --rule       #C7BB9B
--ink-deep   #1F1B14   --ink-soft   #3C3324   --ink-mute   #766A4F
--ink-fade   #9C9075
--sepia      #5C3A21   --wax        #7D2A1A   --wax-soft   #A23F2A
--candle     #C9892A   --moss       #5F6B43

--serif      'Newsreader', Georgia, serif
--sans       'Geist', ui-sans-serif, system-ui, sans-serif
--mono       'JetBrains Mono', ui-monospace, Menlo, monospace

--r-1 2 · --r-2 4 · --r-3 8 · --r-4 14 · --r-pill 999
--s-1 4 · --s-2 8 · --s-3 12 · --s-4 16 · --s-5 24 · --s-6 32
--s-7 48 · --s-8 64 · --s-9 96 · --s-10 128

--paper-1  resting card
--paper-2  raised card / recorder
--paper-3  held / lifted (modal)

--dur-quick   240ms     --ease-paper  (.22,.61,.36,1)
--dur-calm    520ms     --ease-fold   (.55,.05,.25,1)
--dur-cinema  1100ms
```

---

## 14. Open problems (still to design)

- **Handoff trigger UX** - three release modes (creator-released · scheduled · executor-key). Same envelope, different inscriptions. The executor-key flow needs careful handling - how does an executor identify themselves without it feeling administrative? Current direction: a printed phrase the creator hands a trusted person, entered in a dedicated quiet surface.
- **View mode introduction for nominees** - not saccharine, not clinical, not assuming bereavement. Current direction: the envelope is silent; the inscription names only the moment, not the cause.
- **Voice-clone consent ceremony** - four-step flow drafted in §5; needs interactive prototype to confirm pacing.
- **"Ask about survivors" branching** - sketched as a gentle prompt below the recorder. Needs to be tested for false-positive triggers.
- **Empty-Reflection emotional fingerprint** - what does Reflection look like when there's nothing yet? Current direction: a single Newsreader italic line ("Nothing yet. Heirloom is patient.") with no CTA; the recorder is one tap away from anywhere in the app.

---

## 15. File map

```
/
├── Heirloom Design System.html   ← interactive system, tweak-driven
├── DESIGN.md                     ← this file
├── app.jsx                       ← live previews + tweaks wiring
├── logos.jsx                     ← logo explorations
└── tweaks-panel.jsx              ← tweaks shell (starter)
```

Next deliverables, in order:

1. **Asset folder** - placeholder imagery, recorded audio motifs, logo exports (SVG + PNG).
2. **Creator onboarding → first capture** - interactive HTML prototype (mobile + desktop).
3. **Nominee first-visit sealed-letter reveal → first playback** - interactive HTML prototype.
4. **Single-screen mocks** in device frames for the screens listed in §12.

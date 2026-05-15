# SCREENS.md

Every screen in Heirloom, mapped to: file → components → API calls → states → acceptance criteria.

Read alongside `FLOWS.md` (the path-by-path map) and the prototype HTMLs (frozen visual references).

---

## Screen index

| # | Screen | File | Role |
|---|---|---|---|
| 1 | Portal | `src/app/portal/page.tsx` | both (public) |
| 2 | Creator Onboarding (5 steps) | `src/app/onboarding/onboarding-flow.tsx` | creator |
| 3 | Creator Home | `src/app/_components/home.tsx` | creator |
| 4 | Capture Sheet (voice / note / photo) | `src/app/_components/capture-sheet.tsx` | creator |
| 5 | Reflection Room | `src/app/reflect/{page,room}.tsx` | both |
| 6 | Citation drawer | inline in `room.tsx` | both |
| 7 | Nominee Onboarding (envelope + seal) | `src/app/welcome/{page,envelope,welcome-flow}.tsx` | nominee |
| 8 | Nominee Home | `src/app/_components/nominee-home.tsx` | nominee |
| 9 | Album (themed) | `src/app/album/[theme]/page.tsx` | nominee |
| 10 | Settings | `src/app/settings/{page,settings-client}.tsx` | creator |
| 11 | Transparency | `src/app/transparency/page.tsx` | both |
| 12 | Executor Setup | `src/app/executor/setup/` | creator |
| 13 | Executor Unlock | `src/app/executor/unlock/` | executor (public) |
| 14 | Dev console | `src/app/dev/{page,controls}.tsx` | dev only |

---

## Per-screen detail

### 1. Portal

- **Route:** `/portal`
- **Components:** BrandMark (large), tagline, "Begin a new archive" primary, "I have a sealed letter" link
- **States:** static
- **Acceptance:** the seal monogram + "Heirloom" wordmark + tagline + two CTAs render with no API calls. "Begin a new archive" routes to `/onboarding` (creator session bootstrap). "I have a sealed letter" routes to `/welcome` (envelope + passphrase).

---

### 2. Creator Onboarding

- **Route:** `/onboarding`
- **Component:** `OnboardingFlow` in `src/app/onboarding/onboarding-flow.tsx`
- **Steps (5):**
  1. **Welcome** - display name input + optional selfie (`<input type="file" accept="image/*" capture="user">` → face-api.js client-side scan → 128-d descriptor posted to `/api/onboarding/self`)
  2. **Voice** - read the canonical `VOICE_SCRIPT` (in `src/lib/voice-record.ts`), record via MediaRecorder, transcode webm → wav (`webmBlobToWav`), POST to `/api/voice/clone`. Skip option always available.
  3. **Anchors** - life events (kind, label, date, recurrence). POST batch to `/api/onboarding/life-events`.
  4. **Nominees** - one or more `{name, relation, birthday}`. POST to `/api/onboarding/nominees`. Server returns `{nominees: [{name, passphrase}, ...]}` with the per-nominee passphrase shown ONCE.
  5. **Letters** - eagerly fetches Gemma-generated occasion prompts via `/api/onboarding/seed-prompts`, lets the creator write a body for any of them (skip any/all). POST to `/api/onboarding/seed-letters`. Then `/api/onboarding/complete` flips `vaults.onboarded_at` and the router redirects to `/`.
- **Acceptance:**
  - Each step has a "Back" button that doesn't destroy state.
  - The passphrase reveal card on Step 4 → 5 transition is the only place the passphrase appears.
  - Voice step skip is prominent (the TTS sidecar may not be installed).
  - Each step's Continue button shows a "Saving..." state.

---

### 3. Creator Home

- **Route:** `/` (when `session.role === 'creator'` AND `vaults.onboarded_at IS NOT NULL`)
- **Component:** `<Home>` in `src/app/_components/home.tsx`
- **API:** `GET /api/me/home` (SSR fetch) + async `GET /api/prompt/shuffle` from the client
- **Layout (top → bottom):**
  - BrandMark (seal 28px + "Heirloom" wordmark `font-serif italic 19px font-semibold`) top-left; "SETTINGS" eyebrow link top-right
  - Long-date mono eyebrow ("FRIDAY, MAY 15")
  - Greeting: `font-serif text-[34px]` "Good {morning|afternoon|evening}," + name in `italic text-wax`
  - "A place to begin" card (`bg-paper-2`, rounded-[14px], oxblood "Another" shuffle button on the right). Prompt streams in italic 21px serif. Two buttons: primary "Speak it" + ghost "Or write"
  - "CAPTURE" mono eyebrow + 2×2 grid of capture chips (Voice / Note / Photo / Video disabled). Each chip is a wax-tinted icon + label + sub-label.
  - "Ask the archive a question" card linking to `/reflect`
  - Local drafts ribbon when `countDrafts() > 0`
  - "RECENT N" eyebrow + capture row list. Each row: kind-tinted icon, relative timestamp, optional title, italic transcript snippet, small inline "Their voice" SpeakButton when voice + TTS available.
- **Acceptance:**
  - Home renders with `prompt.text === null`; the prompt fills in async without blocking.
  - Capture chips have 44×44 minimum hit area (mobile a11y).
  - The Video chip is rendered disabled, not hidden.

---

### 4. Capture Sheet

- **Component:** `<CaptureSheet>` in `src/app/_components/capture-sheet.tsx`
- **Trigger:** capture chip click on the home, or "Speak it" / "Or write" on the prompt card (passes `mode` + optional `prompt` into the sheet)
- **Modes:** `voice` | `note` | `photo`
- **API:**
  - `POST /api/capture` (multipart for voice/photo, JSON for note)
  - `GET /api/capture/[id]/status` SSE
- **States:** idle → recording / typing / selecting → uploaded → transcribed → embedded → tagged → ready (or failed)
- **Stage labels** (see `pipelineLabel` in `capture-sheet.tsx`): per-kind copy. Audio: "Saving the recording…" → "Listening for the words…" → "Tracing the threads…" → "Almost there…" → "Saved. This is the beginning." Photo and note have parallel sets.
- **VoiceInput affordance:** the mic icon next to the note title field / the body textarea / wherever the user types - records a short clip, POSTs to `/api/transcribe`, appends the transcript to the bound field. The user remains the author; they edit before submit.
- **Acceptance:**
  - Recording audio commits to the server even if the user closes the sheet immediately after stop (no IndexedDB queue; tab must stay open).
  - Photo mode: face-api.js detects faces client-side and posts `metadata.faces[]` with the multipart payload.
  - Note mode autosaves a draft to IndexedDB when the sheet is dismissed without save.
  - Tag chips render with skeleton placeholders during `embedded` → `tagged` stages.

---

### 5. Reflection Room

- **Route:** `/reflect` (both roles)
- **Components:** `src/app/reflect/page.tsx` (server, reads role + creator name to pick suggested prompts) + `room.tsx` (client SSE consumer)
- **API:** `POST /api/reflect` (POST + fetch-stream reader, not EventSource)
- **Components within:** BrandMark + "REFLECTION" eyebrow header; idle suggested-prompt list (italic 15px); progress status with breath-dot animator; skeleton lines; final answer (serif body 19px); citation chip list (mono uppercase) below a thin rule; bottom-fixed composer (italic placeholder input + VoiceInput mic + "Ask" button); 80vh citation drawer.
- **States:** idle → retrieving → grounded (or ungrounded → empty state) → answering (with `answer_partial` streaming) → done (or error)
- **Suggested prompts:**
  - Creator default: `"Tell me about your grandmother." / "What did you learn from your father?" / "What did you wear when you got married?"`
  - Nominee on a known seed archive: `ARCHIVE_PROMPTS` keyed by creator name (Sagan / Rogers / Gandhi)
- **Auto-ask:** if `?q=<text>` is in the URL (nominee mood pivot), the room auto-submits on mount.
- **Acceptance:**
  - First `retrieved` event arrives within ~3 s on GPU laptop / ~30 s on CPU VM.
  - The empty-state path (`grounded:false` from below-threshold retrieval) returns in <200 ms - Gemma is never called.
  - Citation chips become tappable from the moment they render.
  - Empty-state copy is **verbatim**: "I don't have that in the archive. Try asking another way?"
  - The citation drawer's SpeakButton self-hides when no voice profile / TTS unreachable.

---

### 6. Citation drawer

- **Trigger:** tap a citation chip from a grounded Reflection answer
- **Layout:** bottom-sheet drawer, 80vh max, `bg-paper rounded-t-[24px] shadow-paper-3`. Top row: "Source capture" eyebrow + close X. Below: big SpeakButton + italic 17px snippet. Bottom: mono "capture id · {8-char prefix}".
- **Acceptance:**
  - The snippet displayed is the verbatim retrieved chunk text (truncated to 220 chars), not Gemma prose.
  - The SpeakButton's `text` prop is the same snippet - keeps the verbatim contract intact.

---

### 7. Nominee Onboarding

- **Route:** `/welcome` (with optional `?stage=opening|emerging|unfolding|reading` for dev frozen-stage debugging)
- **Components:** `src/app/welcome/page.tsx` (router gate) + `envelope.tsx` (the closed envelope + passphrase form) + `welcome-flow.tsx` (post-passphrase animation + letter unfold)
- **API:** `POST /api/auth/nominee-passphrase`
- **Steps:**
  1. Envelope closed with the wax "H" seal. Passphrase input "the words you were told". "Open" button.
  2. On argon2-match: seal-break animation (CSS keyframes, ~1.2 s). Cookie is set.
  3. Letter unfolds, displays the creator's framing letter from the nominee's `letter_body`.
  4. "Enter the archive" link routes to `/`.
- **Acceptance:**
  - Subsequent visits route past `/welcome` straight to `/`.
  - Wrong passphrase → gentle shake on the input, no leak of which vault would have opened.

---

### 8. Nominee Home

- **Route:** `/` (when `session.role === 'nominee'`)
- **Component:** `<NomineeHome>` in `src/app/_components/nominee-home.tsx`
- **API:** `GET /api/me/home` (the GET fires `fireLetterConditions({trigger_kind:'calendar'})` first so first_visit / date / life_event letters surface on the same load)
- **Layout (top → bottom):**
  - BrandMark + "ARCHIVE" eyebrow header
  - **Framing strip:** small seal (36px) + "FROM <creator>" + first clause of `letter_body` in italic. Animates in.
  - **Newly-fired letter cards:** gold-bordered (`border-wax`), wax-amber gradient bg. Each shows the occasion prompt, the letter body, a "Hear them read this" big SpeakButton, mono "<trigger>" footer.
  - **Today's memory hero:** "TODAY'S MEMORY" eyebrow with a wax tick; long-date + kind; optional photo at the top; transcript snippet; big SpeakButton ("Hear it in their voice"). Deterministic per nominee per day.
  - **MoodCard:** "IF YOU NEED IT" eyebrow + "Tell the archive what kind of moment you're in." italic body. Four mood chips (archive-tailored or fallback) + "Something else…" expandable typed input with VoiceInput mic. On tap, POST `/api/nominee/mood`. If a letter fires, the inline confirmation shows + the home refreshes after 1.2 s. If nothing fires, the client navigates to `/reflect?q=<chip>` so the tap always lands somewhere.
  - **Themes** grid (themed_albums): 2-column tiles linking to `/album/[theme]`.
  - **Earlier pieces** list of every other released capture. Each row: thumbnail (photo) or kind icon, mono long-date, optional title, italic snippet, small inline SpeakButton.
  - **Floating Reflection pill** fixed near the bottom: "Ask the archive a question" → `/reflect`.
- **Acceptance:**
  - The framing strip uses the first clause of `letter_body` (regex stops at the first `.!?`) - it never spills into a paragraph.
  - The "Hear them read this" SpeakButton on newly-fired-letter cards uses `smartSnippet(capture.body, 600)` - up to 600 chars of verbatim source.

---

### 9. Album (themed)

- **Route:** `/album/[theme]`
- **Component:** `src/app/album/[theme]/page.tsx`
- **API:** RLS-gated query for all released captures with `capture_tags.value = theme AND kind = 'topic'`
- **Acceptance:** mirrors the nominee home row pattern; renders the title (`Theme` capitalized) + the list. Empty list when no released captures match.

---

### 10. Settings

- **Route:** `/settings` (creator only - redirects to `/portal` for nominees)
- **Component:** `<SettingsClient>` in `src/app/settings/settings-client.tsx`
- **Sections (in order):**
  1. **You** - display name, save-on-blur, identity-index resync on change.
  2. **Important dates** - life-event CRUD; each save re-embeds + resyncs.
  3. **Nominees** - list with name, relationship, "Reveal passphrase" button (rotates + shows once).
  4. **Your voice** - state machine (checking / unavailable / no-profile / have-profile / recording / uploading / error). Records the same `VOICE_SCRIPT` as onboarding step 2. Shows a "Play a sample" button when a profile exists. Verbatim contract explainer in `<details>`.
  5. **Notifications** - push subscribe / unsubscribe / send-test. iOS PWA install guidance when unsupported.
  6. **Vault** - Export panel (passphrase → `.hloom` download) + Import panel (file + passphrase upload, replaces the current vault wholesale).
- **Acceptance:**
  - Save indicator on display name flips to "Saved" after PATCH 200.
  - Voice section detects TTS sidecar absence and shows the install pointer rather than a broken record button.
  - Export with a too-short passphrase (< 6 chars) returns a server error surfaced in the panel.

---

### 11. Transparency

- **Route:** `/transparency`
- **Component:** `src/app/transparency/page.tsx`
- **API:** reads `reflections` rows for the current user (creator-of-vault or nominee) and renders the diagnostics.
- **Per-row display:** the question, the grounded boolean, top similarity, threshold, rejection reason (if any), and the top retrieved chunks with similarity scores.
- **Acceptance:** every Reflection - grounded or not - appears. The page is the falsifiability surface for the grounding contract.

---

### 12. Executor Setup

- **Route:** `/executor/setup`
- **API:** `POST /api/executor/setup`
- **Acceptance:**
  - Passphrase displayed **once** with the warning that it cannot be retrieved.
  - "Print" routes to the browser print stylesheet.
  - Rotation invalidates the old passphrase immediately.

---

### 13. Executor Unlock

- **Route:** `/executor/unlock` (public, no auth)
- **API:** `POST /api/executor/unlock`
- **Acceptance:**
  - Same gentle-shake on wrong passphrase as nominee onboarding.
  - On success: confirmation that all captures have been released; executor does NOT enter the archive themselves.
  - Rate limit denies the 6th attempt within an hour.

---

### 14. Dev console

- **Route:** `/dev` (gated by `HEIRLOOM_ALLOW_DEV_FIXTURES=1` in production)
- **Component:** `src/app/dev/page.tsx` + `controls.tsx`
- **Features:** see FLOWS.md §15.

---

## Brand mark contract

`<BrandMark>` (in `src/app/_components/brand-mark.tsx`) is the seal + wordmark used in every top-bar:

- Seal: 28×28 (size=`header`), 22×22 (size=`small`)
- Wordmark: `font-serif italic font-semibold tracking-[0.005em]`, 19px header / 17px small
- Renders inside an inline-flex link (or plain span when `href={null}`)
- Used on: creator home, nominee home (`href={null}`), Reflection room, every settings/transparency/executor page

---

## Visual fidelity contract

For every screen above:
- Match the design tokens defined in `design-system/DESIGN.md` (Warm Paper palette, Source Serif 4 / Geist / JetBrains Mono triumvirate, the motion primitives).
- Open the relevant prototype HTML at iPhone-12-mini width (390px) for visual reference. The prototypes are frozen - if a prototype and the running app disagree, the running app wins for behaviour; the prototype wins for type and palette.
- Use only the three motion durations (`--dur-quick` 240 ms / `--dur-calm` 520 ms / `--dur-cinema` 1100 ms) and the two easings (`--ease-paper`, `--ease-fold`). No springs.

# SCREENS.md

Every screen in Heirloom v1, mapped to: prototype file → components → API calls → states → acceptance criteria.

Read alongside `FLOWS.md` (the path-by-path map) and the prototype HTMLs (the visual source of truth).

---

## Screen index

| # | Screen | Prototype | Role |
|---|---|---|---|
| 1 | Creator Onboarding (5 steps) | `Creator Onboarding.html` | creator |
| 2 | Creator Home (Established) | `Creator Home - Established.html` | creator |
| 3 | Capture Studio (voice) | `Creator Onboarding.html` step 5 | creator |
| 4 | Capture Studio (photo) | `Creator Home - Established.html` (sheet) | creator |
| 5 | Capture Studio (note) | `Creator Home - Established.html` (sheet) | creator |
| 6 | Capture Studio (video) | `Creator Home - Established.html` (sheet) | creator |
| 7 | Capture Review (post-save) | `Creator Onboarding.html` step 6 | creator |
| 8 | Threads list / detail | new (build from design system) | creator |
| 9 | Nominees list / detail | new (build from design system) | creator |
| 10 | Executor Handoff (3-step v1) | `Executor Handoff.html` | creator |
| 11 | Preview-as-nominee ribbon | overlays nominee home | creator |
| 12 | Nominee Onboarding (4 steps) | `Nominee Reveal.html` | nominee |
| 13 | Nominee Home (Post-Loss) | `Nominee Home - Post-Loss.html` | nominee |
| 14 | Reflection sheet | `Nominee Reveal.html` step 5 | nominee |
| 15 | Citation drawer | new (component lifted from Reveal) | nominee |
| 16 | Capture detail | new (build from design system) | nominee |
| 17 | Saved passages list | new | nominee |
| 18 | Settings | new | both |
| 19 | Executor Unlock | new (mirror of nominee onboarding) | executor |

---

## Per-screen detail

### 1. Creator Onboarding

- **Prototype:** `prototypes/Creator Onboarding.html` (all 5 steps)
- **Route:** `/onboarding/creator`
- **Components:** Portal seal, Passphrase input, Display-name input, Prompt picker (3 cards), Audio capture sheet
- **API:**
  - `POST /auth/magic-link` (sends magic email at step 1 if account doesn't exist)
  - `POST /auth/verify` (claims the magic token)
  - `POST /capture` (commits the first capture)
- **States:** initial · in-flight (loading) · validation-error · success
- **Acceptance criteria:**
  - User completes from portal to first saved capture in **≤ 90 seconds** on a fast connection
  - Each step is independently navigable backward; back never destroys typed input
  - Passphrase strength is shown inline, not gated
  - First-capture step accepts mic-denied gracefully (routes to note path)

---

### 2. Creator Home (Established)

- **Prototype:** `prototypes/Creator Home - Established.html`
- **Route:** `/`
- **Components:** Greeting block · Prompt-of-day card · Capture chip grid (2×2) · Thread cards · Recent captures feed · Nominee cards · Tab bar
- **API:** `GET /me/home` → renders entire payload
- **States:** loading skeleton · populated · empty (first-month variant) · partial-sync (ribbon visible)
- **Acceptance criteria:**
  - Render with **0 prompt-of-day API calls** if the cached prompt is < 24h old
  - Tabbing the prompt card focuses the begin button (a11y)
  - Capture chips are 44×44 minimum hit area (mobile a11y)
  - Thread stripe colors match design tokens; new threads default to oxblood
  - Recent captures feed shows audio with waveform, photo with thumbnail, note with first 80 chars

---

### 3. Capture Studio - Voice

- **Prototype:** `prototypes/Creator Onboarding.html` step 5 + sheet pattern in `Creator Home - Established.html`
- **Route:** sheet `?sheet=capture&mode=voice`
- **Components:** Sheet handle · Sheet title · Sheet prompt · Live waveform · Record button (72px oxblood circle) · Streaming transcript pane · Action row
- **API:**
  - `POST /capture` (multipart)
  - `GET /capture/{id}/status` SSE
- **States:** idle · recording · stopped · post-review · saving · saved
- **Acceptance criteria:**
  - Waveform updates at **30fps** minimum
  - Transcript streams in within 800ms of recording start
  - Audio is committed to IndexedDB **before** network upload begins (offline-safe)
  - Stopping returns to a review screen; never auto-saves
  - "Save later" creates a draft, not a published capture

---

### 4. Capture Studio - Photo

- **Components:** Sheet shell · 4:5 image frame (`<image-slot>`) · Caption italic textarea · Tool row (`Retake` · `From library` · `Date`)
- **API:** `POST /capture` multipart with `kind='photo'`
- **States:** empty · selecting · selected · saving · saved
- **Acceptance criteria:**
  - Compresses >20MB photos client-side
  - Allows empty caption
  - EXIF date pre-filled when sensible; can be overridden

---

### 5. Capture Studio - Note

- **Components:** Sheet shell · Borderless 17px Source Serif textarea · Mono footer (word count + autosave state)
- **API:** `POST /capture` JSON
- **States:** typing · autosaving · saved
- **Acceptance criteria:**
  - Autosave every 2s of inactivity
  - Draft persists across sheet dismiss
  - Word count is live

---

### 6. Capture Studio - Video

- **Components:** Sheet shell · 9:16 viewfinder · Record button · Recording HUD · Inline guidance line
- **API:** `POST /capture` multipart with `kind='video'`
- **States:** idle · recording · review · transcoding · saving · saved
- **Acceptance criteria:**
  - Soft cap 2:00; hard cap 5:00
  - Transcodes to H.264 720p via MediaRecorder before upload
  - Pulls first frame as poster image

---

### 7. Capture Review

- **Prototype:** `prototypes/Creator Onboarding.html` step 6
- **Components:** Capture preview · Gemma-suggested tags (oxblood pill chips, removable) · Gemma-suggested follow-up question · Title input (optional) · Save row
- **API:** waits for SSE `event: tags` before rendering the chips
- **Acceptance criteria:**
  - Tags appear within 2s of recording stop; show skeleton chips while waiting
  - Removing a tag PATCHes the capture
  - Tapping a follow-up question opens a new voice sheet pre-filled

---

### 8. Threads list / detail

- **Build from design system:** Thread card pattern × N
- **Route:** `/threads` · `/threads/[id]`
- **API:** `GET /threads`, `GET /thread/{id}` (returns captures in position order)
- **Acceptance:** drag-reorder captures within a thread; color-pick from the 4 token colors

---

### 9. Nominees list / detail

- **Components:** Nominee card pattern (avatar · name · relationship · status) · Add-nominee CTA
- **Route:** `/nominees`
- **API:** `GET /nominees`, `POST /nominee`, `POST /nominee/{id}/release`
- **Acceptance:** A nominee with no release assignments shows `0 pieces · awaiting`. Executor nominees are visually inverted (ink fill).

---

### 10. Executor Handoff (3-step v1)

- **Prototype:** `prototypes/Executor Handoff.html` - **note**: prototype shows 4 steps (Shamir 2-of-3). v1 collapses steps 3→4 into a single passphrase reveal screen.
- **Route:** `/executor/setup`
- **Steps (v1):**
  1. Why this matters (educational; copy preserved from prototype)
  2. Choose person (uses Nominees list)
  3. Set passphrase + Letter preview (combined)
- **API:** `POST /executor/setup` → returns passphrase + letter body (one-shot)
- **Acceptance:**
  - Passphrase shown **once**; warning if user tries to leave without recording it
  - "Print" routes to browser print stylesheet
  - "Email myself" is allowed but suggests print as primary

---

### 11. Preview-as-nominee

- **Component:** Top-of-screen oxblood ribbon when previewing
- **Route:** `/preview/nominee/[id]`
- **API:** `POST /nominee/{id}/preview` returns the nominee-home payload
- **Acceptance:** ribbon present on every screen during preview; exiting returns to creator home

---

### 12. Nominee Onboarding

- **Prototype:** `prototypes/Nominee Reveal.html` steps 1–4
- **Route:** `/welcome/[token]`
- **Steps:** Envelope → Passphrase → Seal break (CSS animation, 1200ms) → Letter unfold → Welcome screen → Home
- **API:**
  - `POST /auth/verify` with magic token + passphrase
- **Acceptance:**
  - Seal-break animation completes even if user taps through; no jank
  - Subsequent visits skip steps 1–4 entirely; route straight to home
  - Wrong passphrase: gentle shake, no failure counter visible

---

### 13. Nominee Home

- **Prototype:** `prototypes/Nominee Home - Post-Loss.html`
- **Route:** `/`
- **Components:** Framing strip · Latest-unlocked hero · Thread cards · Sealed-pieces card · Saved passages · Reflection pill
- **API:** `GET /me/home`
- **Acceptance:**
  - Latest-unlocked plays inline (no navigation needed)
  - Sealed-pieces card displays correct release condition in italic oxblood
  - Reflection pill is **always** above the tab bar with 16px gap

---

### 14. Reflection sheet

- **Prototype:** `prototypes/Nominee Reveal.html` step 5
- **Route:** sheet `?sheet=reflect`
- **Components:** Question input · Streaming claim list · Citation chips · Empty-state card
- **API:** `POST /reflect` SSE
- **Acceptance:**
  - First claim renders within 2s of submit
  - Citation chips are tappable from the moment they render
  - Empty-state copy is **verbatim**: *"I don't have that in the archive. Try asking another way?"*
  - Question history persists across reopen

---

### 15. Citation drawer

- **Component:** bottom-sheet drawer, 80vh
- **Trigger:** tap any citation chip in Reflection
- **API:** `GET /capture/{id}`
- **Acceptance:**
  - Highlights the cited transcript line
  - Audio scrubber jumps to the cited timestamp on open
  - `Save passage` button creates a `saved_passages` row

---

### 16. Capture detail

- **Route:** `/capture/[id]`
- **Components:** Capture body (varies by kind) · Tags · Saved-passage CTA · Related captures
- **Acceptance:** transcript is selectable; selecting text reveals a `Save passage` floating button

---

### 17. Saved passages list

- **Route:** `/saved`
- **Components:** Pulled-quote cards (lifted from nominee home pattern)
- **API:** `GET /saved`
- **Acceptance:** swipe-to-remove on mobile; long-press on desktop

---

### 18. Settings

- **Route:** `/settings`
- **Sections:** Account · Passphrase · Executor (for creators) · Notifications · About · Sign out
- **Acceptance:** Account deletion is 7-day soft delete with confirmation phrase

---

### 19. Executor Unlock

- **Route:** `/executor/unlock`
- **Components:** Email-hint input · Passphrase input · Unlock CTA
- **API:** `POST /executor/unlock`
- **Acceptance:**
  - Same gentle-shake on wrong passphrase as nominee onboarding
  - On success, shows a confirmation screen - does **not** take executor into the archive (executor sees only release status, never content)

---

## Visual fidelity contract

For every screen above:
- Open the prototype HTML in a browser at iPhone-12-mini width (390px)
- Match: type sizes, oxblood `#7d2a1a`, paper `#faf7f0`, ink `#1a1612`, sepia/moss accents
- Match: motion (page-turn 320ms ease-out, soft fade 220ms, waveform 60Hz breathing)
- Match: copy verbatim where shown

If the prototype and this doc disagree, **the prototype wins** for visuals and **this doc wins** for behavior.

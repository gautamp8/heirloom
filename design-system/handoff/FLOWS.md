# FLOWS.md

Every user-facing flow in Heirloom, with **happy path**, **alternate paths**, and **failure modes**.

Convention:
- + = happy path
- ↪ = alternate path (valid but not default)
- ! = recoverable failure
- X = hard failure

---

## 1. Creator onboarding (first run)

**Route:** `/onboarding` (redirected to from `/` when `vaults.onboarded_at IS NULL`)
**Component:** `src/app/onboarding/onboarding-flow.tsx`
**Steps:** Welcome (name + optional selfie) → Voice (read VOICE_SCRIPT) → Anchors (life events) → Nominees → Letters

+ User picks "Begin a new archive" on the portal, types their name (e.g. "Rita"), optionally adds a selfie (face-api.js scans for a face client-side, posts the 128-d embedding to `/api/onboarding/self`), records ~30 s of the VOICE_SCRIPT, adds at least one nominee, picks 0-N Gemma-generated occasion prompts to write seed letters against, lands on the creator home.

↪ User skips the voice step → onboarding continues; voice features stay hidden until the user records from Settings → Voice later.

↪ User skips the selfie → onboarding continues; the embedding is null, photo-caption naming falls back to generic "a person".

↪ User picks zero seed letters → empty-state copy, "Skip and continue" button labels appropriately.

! Mic permission denied during voice step → inline error, "Try again" button. Skip option remains available.

! Selfie face-detection finds no face → inline note "No face detected. Try a clearer photo or skip this step." User can retry or proceed.

! `POST /api/voice/clone` fails (TTS sidecar offline) → inline message "Couldn't save your voice. The engine may be starting up." Skip option remains available.

X Network down during a save → error surface, user retries. There is no IndexedDB queue for onboarding writes.

---

## 2. Voice capture

**Surface:** Capture sheet, voice mode
**Components:** `src/app/_components/capture-sheet.tsx` (sheet shell) + voice mode tab
**API:** `POST /api/capture` (multipart) + `GET /api/capture/[id]/status` (SSE)

+ User taps the "Voice" chip on the home, sheet slides up, taps the wax-red record button, sees the live timer and waveform, taps stop, the sheet shows calm stage labels ("Saving the recording…", "Listening for the words…", "Tracing the threads…", "Almost there…", "Saved. This is the beginning."), Whisper transcript fills in once embed-stage emits, tags appear as chips, taps close.

↪ User taps stop before 3 s → recording is still committed; the pipeline runs with whatever was captured.

! Mic permission denied → sheet shows banner with link to system settings; "Switch to writing instead" link routes to note mode.

! Network drops mid-record → audio is preserved in browser memory; on save, the upload still goes through. There is **no** IndexedDB queue in current code; the user must keep the tab open until upload completes.

X Whisper fails for the entire pipeline (process crash) → capture moves to `status='failed'`; the recording blob is preserved on disk. Surfaces as "failed" on the home row.

---

## 3. Photo + caption capture

**Surface:** Capture sheet, photo mode
**API:** `POST /api/capture` multipart with `kind='photo'`

+ User taps "Photo" chip, system picker opens, picks an image. face-api.js scans for faces client-side and attaches `{bbox, embedding}` arrays to the multipart `metadata.faces` field. Pipeline writes the blob, Gemma 4 vision captions it (using recognized people from `face_appearances` joined through `people.display_name`), tags it, marks ready.

↪ The photo contains a face that matches a known `people` row (typically the creator from the onboarding selfie, or a nominee whose face has been confirmed) → Gemma 4 caption names them in plain English.

! face-api.js fails to load model weights → upload still proceeds with `faces: []`; caption is generic.

X Non-image file uploaded → server returns `bad_kind`; client surfaces the error.

---

## 4. Note capture

**Surface:** Capture sheet, note mode
**API:** `POST /api/capture` JSON

+ User taps "Note" chip, types into the borderless serif textarea, watches the word count tick in mono, taps "Save to vault". The sheet shows the same pipeline labels as voice (the audio-specific copy is conditional in `pipelineLabel`). Gemma generates a title in the background if the user didn't write one.

↪ User taps the mic icon next to the title field → records dictation, transcript appends to the body, user edits and saves.

↪ User backs out of the sheet → an IndexedDB draft is created (count surfaces on the home as "N drafts are safe in your browser").

! Network drops during save → server returns error, user retries. Draft persists in IndexedDB.

---

## 5. Video capture

Currently **disabled in the UI** (`<CapChip ... disabled />` on the home). The schema, RLS policies, and pipeline branches all support `kind='video'`; the client just doesn't expose a capture sheet for it yet. Re-enabling is straightforward when the work is prioritized.

---

## 6. Creator home

**Route:** `/` (when `session.role === 'creator'`)
**Component:** `src/app/_components/home.tsx`
**API:** `GET /api/me/home` + async `GET /api/prompt/shuffle`

+ User opens the app authenticated, sees:
- BrandMark (seal + "Heirloom" wordmark) top-left, "SETTINGS" link top-right
- Long-date eyebrow ("FRIDAY, MAY 15")
- Greeting block "Good morning, **Rita**" (name in wax italic)
- "A place to begin" card with Gemma-generated prompt-of-day, "Speak it" primary + "Or write" secondary, "Another" shuffle affordance
- 2×2 capture chip grid (Voice / Note / Photo / Video disabled)
- "Ask the archive a question" card linking to `/reflect`
- Local-drafts count line (if `countDrafts() > 0`)
- "Recent" header with capture count, list of recent captures with kind-tinted icon, mono timestamp, serif title, italic transcript snippet, small "Their voice" SpeakButton when a voice profile + TTS are both available

↪ Zero captures yet → recent list shows `"Begin when you're ready."`

! Prompt-of-day fetch fails or times out → the prompt card shows "Composing a prompt for you…" indefinitely (the home does not currently fall back to a static prompt).

X `/api/me/home` returns non-200 → page renders "Home failed to load: HTTP {status}".

---

## 7. Nominee onboarding (first-ever visit)

**Routes:** `/portal` → `/welcome` → `/`
**Components:** `src/app/portal/`, `src/app/welcome/`

+ Nominee taps "I have a sealed letter" on the portal, sees the closed envelope with the wax seal "H" monogram, types the passphrase the creator handed them in person, taps "Open". On argon2-match, the seal-break animation plays (CSS, ~1.2 s), the letter unfolds, displays the creator's framing letter ("Sam - there is something here for you."), taps "Enter the archive", lands on the nominee home.

↪ Subsequent visits skip the envelope entirely - the cookie-bound session routes straight to `/` and the nominee home renders.

! Wrong passphrase → gentle shake on the input + neutral message. No counter visible. Rate limit (per IP) silently degrades after repeated failures.

X Vault deleted on the server side → on next request the cookie still verifies but the framing lookup returns null; the nominee home renders with `from_name: "the creator"` and an empty `released_captures` list.

---

## 8. Nominee home

**Route:** `/` (when `session.role === 'nominee'`)
**Component:** `src/app/_components/nominee-home.tsx`
**API:** `GET /api/me/home` (which calls `fireLetterConditions({trigger_kind:'calendar'})` at the top)

+ Nominee opens the app, sees:
- BrandMark top-left, "ARCHIVE" eyebrow top-right
- Framing strip: small seal + "FROM <creator>" eyebrow + the first clause of `letter_body` (italic serif). Animates in on mount.
- Any `newly_fired_letters` from this load: full gold-bordered "sealed for you" cards with the occasion prompt, the letter body, and a "Hear them read this" big SpeakButton.
- "Today's memory" hero - the deterministic daily memory (same all day for this nominee, rotates each calendar day). Photo or transcript snippet with a "Hear it in their voice" SpeakButton.
- "If you need it" mood card with 4 chips + "Something else…" expandable input + dictation mic. Chips are archive-tailored per known seed (Sagan / Rogers / Gandhi); fallback chips are "I miss you / I need advice / On hard days / A big moment".
- "Themes" 2-column grid (themed_albums) when ≥ 2 captures share a topic tag.
- "Earlier pieces" list of every other released capture.
- Floating "Ask the archive a question" pill above the fold, links to `/reflect`.

↪ Zero released captures yet → `"Your archive is ready. The first piece will appear here."`

↪ A mood-chip tap that fires a sealed letter → the unlocked occasion shows inline ("<occasion> - opened just for you") and the home refreshes after 1200 ms to surface the new unlocked-letter card.

↪ A mood-chip tap that doesn't fire anything → client navigates to `/reflect?q=<chip text>` so the tap always lands somewhere meaningful.

! Daily-memory roll lands on a capture whose blob is missing → photo `<img>` renders broken; the transcript snippet is still readable.

---

## 9. Reflection query

**Route:** `/reflect`
**Components:** `src/app/reflect/page.tsx` (server) + `room.tsx` (client SSE consumer)
**API:** `POST /api/reflect` (SSE via fetch+reader, not EventSource - EventSource doesn't support POST)

+ User types a question, taps "Ask". The composer disables, the answer area shows:
- `"Searching the archive..."` while the question is embedded + top-5 retrieval runs
- `"Found N memories. Listening for an answer..."` once `retrieved` fires with hits above threshold
- Skeleton lines pulse until `answer_partial` starts arriving
- Answer streams in (third person serif body)
- Below a thin rule: "Drawn from N captures · Tap to view the source" + citation chips with mono uppercase labels
- Tap a chip → 80vh bottom-drawer with the source snippet + a big SpeakButton ("Hear in their voice")

↪ The page was opened with `?q=` (mood-card pivot or "auto-ask from somewhere else") → auto-submits on mount.

↪ Suggested prompts on idle - tailored per known seed archive by creator name. Sagan: "What did you write about the pale blue dot?" etc. Rogers / Gandhi each have their own set. Default fallback for unknown creators: "Tell me about your grandmother." / "What did you learn from your father?" / "What did you wear when you got married?"

↪ A nominee asks a question whose embedding fires a sealed letter (semantic_match condition under threshold) → a `sealed_letter` SSE event arrives first. The room doesn't currently render this inline (it's surfaced via the home unlocked-letter card on next refresh), but the letter unlocks immediately so it's available on the next `/api/me/home` load.

! `retrieved` returns 0 hits OR `top_similarity < 0.40` → `grounded:false` arrives, `answer` event sends the verbatim empty state "I don't have that in the archive. Try asking another way?", model is never called.

! Final validation fails (citation outside retrieved set, first-person prose, no claims) → answer collapses to the empty state, `grounded` re-fires false, `diagnostics.rejected_for` records the reason (`first_person` / `invalid_citation` / `no_claims`).

! Gemma errors mid-stream → `error` event closes the stream; the room sets `status: 'error'`. Already-streamed text remains visible.

X `/api/reflect` itself 401s → fetch is non-ok, the room shows the same error state. User needs to re-sign-in.

---

## 10. Citation drawer

**Component:** inline in `room.tsx`
**Triggered by:** clicking a citation chip after a grounded answer

+ Drawer slides up from the bottom (80vh max). Shows: "Source capture" eyebrow, big SpeakButton, the cited snippet in italic serif, "capture id · 8-char-prefix" mono line.

↪ Voice profile + TTS available → SpeakButton renders. Tapping plays the snippet through the cloned voice (verbatim only - the snippet, not the Reflection answer prose).

↪ Voice profile missing or TTS sidecar unreachable → SpeakButton self-hides on mount.

! The cited snippet's blob is missing → SpeakButton still shows but the `/api/voice/speak` request resolves to text-only synthesis from the sidecar (the audio still plays).

---

## 11. Sealed-letter unlock paths

Sealed letters unlock through four mechanisms (see `src/lib/letter-conditions.ts`):

1. **first_visit** - fires on first nominee load of `/api/me/home` after the letter was sealed. Surfaces in `newly_fired_letters` on the home payload.
2. **date / life_event / calendar** - fires when the cron / scheduled-check runs (`POST /api/cron/daily-memory` if the date matches, also re-checked on every nominee home load).
3. **state** - fires when a nominee taps a mood chip or types into "Something else…" - via `POST /api/nominee/mood`.
4. **semantic_match** - fires when a nominee asks Reflection a question whose embedding sits within `threshold` (typically 0.55) of the letter's `intent_embedding`. Runs before retrieval inside `POST /api/reflect`.

Every fired letter inserts a `nominee_releases` row scoped to the right nominee(s), so RLS naturally surfaces the underlying capture downstream. The sealed letter row is also marked `unlocked_at = now()` and `unlocked_by_trigger` records which mechanism fired.

---

## 12. Executor handoff (creator side)

**Route:** `/executor/setup`
**API:** `POST /api/executor/setup`

+ Creator opens the page, generates the executor passphrase, sees it once with the warning that it cannot be retrieved. Copies it down (paper, password manager, in-person handoff). Server stores `argon2id(passphrase)` only.

! Creator rotates the passphrase → old one is invalidated immediately. Warning surfaces.

---

## 13. Executor unlock (executor side)

**Route:** `/executor/unlock` (public, no session needed)
**API:** `POST /api/executor/unlock` (rate-limited)

+ Executor visits the URL, enters the vault email hint + passphrase. On argon2-match: atomic insert of `nominee_releases` for every capture × every nominee in the vault, `released_at = now()`. Confirmation screen. Executor does NOT enter the archive themselves.

! Wrong passphrase → gentle shake + retry. 5 wrong / IP / hour → rate limit. 10 lifetime → credential locked, executor sees "no longer valid."

---

## 14. Settings

**Route:** `/settings` (creator only)
**Components:** `src/app/settings/page.tsx` (server) + `settings-client.tsx`

Sections (in order):
1. **You** - display name (auto-save on blur). Triggers identity-index resync.
2. **Important dates** - add/remove life events. Each save triggers identity-index resync + re-embeds the row.
3. **Nominees** - list with passphrase-set state. "Reveal passphrase" rotates the passphrase and shows it once.
4. **Your voice** - state machine: checking → unavailable / no-profile / have-profile / recording / uploading / error. Records the VOICE_SCRIPT against the LuxTTS sidecar. Includes the verbatim contract explainer in a collapsible `<details>` block. Shows a "Play a sample" affordance when a profile exists.
5. **Notifications** - request permission, subscribe to push, send a test, turn off. Surfaces iOS-PWA-specific guidance when `Notification` is unsupported. Requires `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
6. **Vault** - Export panel (passphrase → `.hloom` download) + Import panel (file + passphrase upload).

---

## 15. Dev console

**Route:** `/dev` (gated by `HEIRLOOM_ALLOW_DEV_FIXTURES=1` in production)
**Component:** `src/app/dev/page.tsx` + `controls.tsx`

A role-switcher / vault-state dashboard. Lets the developer:
- Open a creator session (lands on `/onboarding` for fresh users)
- Open a fixture nominee session against the most recent vault
- Sign out
- View vault counts (captures, nominees, released, reflections)
- Jump to every creator + nominee + executor surface
- Open the welcome animation frozen at any of its four stages (`?stage=opening|emerging|unfolding|reading`)
- Reset the vault (truncate captures/transcripts/chunks/tags/reflections/nominees/releases/executor-creds; users + vaults preserved for stable IDs)

Used during development and end-to-end testing. The dev passphrase for the fixture-nominee shortcut is `the long road home`.

---

## 16. Empty states - canonical list

1. **No captures yet** (creator home, Recent list): "Begin when you're ready."
2. **No released captures yet** (nominee home): "Your archive is ready. The first piece will appear here."
3. **Reflection no-match / failed validation**: "I don't have that in the archive. Try asking another way?" (verbatim, no Gemma call).
4. **No themed albums** (nominee home): section hidden.
5. **No earlier pieces** (nominee home): section hidden.
6. **No prompt-of-day yet** (creator home): "Composing a prompt for you…" placeholder.
7. **No voice profile** (Settings → Voice): "Record this once" record button.
8. **TTS sidecar offline** (Settings → Voice): "The voice engine isn't running on this device yet." with a pointer to `install-tts.sh` in the desktop bundle context.
9. **No nominees on the executor unlock fail**: "This passphrase is no longer valid."

Empty states are warm, never instructional in a help-doc tone. They sound like the rest of the app.

---

## 17. Service-worker offline behaviour

The service worker (`public/sw.js`) installs on first visit and:
- Pre-caches the app shell (`/`, manifest, icons, seal).
- Cache-first for fingerprinted `/_next/static/`, fonts, images.
- Network-first with stale fallback for pages + JSON.
- Never caches POST/PUT/PATCH/DELETE.
- SSE streams always go straight to the network (Accept: text/event-stream).
- Push handler delivers `title + body` notifications; tapping navigates to the supplied URL.

There is **no** background-sync queue for writes in v1. If the network drops mid-capture, the user keeps the tab open; if they don't, the write is lost (audio blobs are committed to IndexedDB drafts only for notes via `src/lib/drafts.ts`).

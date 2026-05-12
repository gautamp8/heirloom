# FLOWS.md

Every user-facing flow in Heirloom v1, with **happy path**, **alternate paths**, and **failure modes**. This is the doc to read before writing UI code for any screen.

Convention:
- ✅ = happy path
- ↪ = alternate path (valid but not default)
- ⚠ = failure mode (recoverable)
- ✋ = hard failure (must be handled, may require support)

---

## 1. Creator onboarding (first run)

**Screens:** Portal · Passphrase · Who-you-are · First prompt · First capture · Post-capture · Home

✅ User taps the portal, taps continue, sets a passphrase, enters their display name, picks a prompt from three options, records 30s of audio, sees Gemma's streaming transcript, taps "Save to vault", lands on the populated-but-empty creator home with their one capture present.

↪ User skips the first capture ("not today") → lands on a quiet home with the prompt card still visible and one nudge: *"Begin when you're ready."*

↪ User picks "I'd rather write" on the first prompt screen → routes to the note sheet instead of voice.

⚠ Mic permission denied → in-page banner: *"Heirloom needs the mic to record. Open settings to enable, or tap to use a different mode."* Two buttons: `Open settings` · `Use writing instead`.

⚠ Passphrase too short (< 12 chars) → inline hint *"A longer phrase keeps your archive safer. Try a memory only you would know."* No error toast.

✋ Account creation fails (network) → toast *"Couldn't save yet. Your work is kept on this device until we reconnect."* Service worker queues the create-account call.

---

## 2. Voice capture

**Screen:** Capture Studio (voice sheet)

✅ User taps the oxblood record button, sees a live waveform breathing in oxblood, streaming transcript appears as italic Source Serif under the waveform, taps stop, sees post-capture review with Gemma-suggested tags and one gentle follow-up question, taps `Save to vault`.

↪ User taps the follow-up question → opens a new voice sheet pre-filled with the question as the prompt.

↪ User taps `Save later` → capture goes to drafts; visible on home with a small "draft" tag, never auto-published.

⚠ Whisper transcription fails mid-record → keep recording; show one-line warning under transcript area: *"Transcription paused. The recording is still being kept."* Retry transcription on save.

⚠ Connection drops mid-record → continue recording locally to IndexedDB. On reconnect, upload + transcribe in the background. Capture appears as `processing` on home with a soft spinner.

⚠ Recording exceeds 5 minutes → soft cap warning at 5:00: *"This is becoming a long memory. Consider breaking it into pieces."* Hard cap at 10:00.

✋ Storage quota exceeded (IndexedDB) → block new recordings, show: *"Your archive is full on this device. Connect to release pending uploads."* Provide an `Upload now` button.

✋ Whisper service down → show a warning ribbon at the top of the home: *"Transcription is paused. Recordings are kept; transcripts will appear when we can run them."* User can still record + save.

---

## 3. Photo + caption capture

**Screen:** Capture Studio (photo sheet)

✅ User taps the photo chip, taps the empty 4:5 frame, system picker opens, user picks a photo, frame fills, types a one-line caption, taps `Save to vault`.

↪ User uses `Retake` (mobile only, opens camera) → camera launches, user takes a new shot.

↪ User leaves the caption empty → save is allowed; the capture saves without a caption. The photo *is* the memory.

⚠ Photo file too large (>20MB) → client-side compression to ~3MB JPEG; preserve original on opt-in *"Keep full-resolution original"*.

⚠ EXIF date present but in future → discard EXIF, use today's date.

⚠ Photo upload fails → kept in IndexedDB; retry queue. Home shows the capture as `processing` with the local thumbnail visible.

✋ User attempts to upload a non-image file → reject in client; show *"Heirloom expects a photo. Try another file."*

---

## 4. Note capture

**Screen:** Capture Studio (note sheet)

✅ User taps the note chip, types into the borderless textarea, sees autosave + word count update every 2s in mono, taps `Save to vault`.

↪ User backs out of the sheet → draft auto-saved; reopening the note chip resumes the draft.

⚠ Network drops during autosave → IndexedDB takes over; visible state stays unchanged; sync on reconnect.

✋ Note exceeds 50,000 characters → soft warning at 10k, hard limit at 50k. *"This is a long note. Consider saving it and starting a new piece."*

---

## 5. Video capture

**Screen:** Capture Studio (video sheet)

✅ User taps the video chip, allows camera + mic, sees a 9:16 viewfinder with record dot, taps record, sees recording-time HUD, taps stop at < 2:00, sees post-capture review with auto-captioned still + transcript, taps `Save to vault`.

↪ User uploads existing video from library → same review screen; transcribe + tag flow runs server-side.

⚠ Camera permission denied → inline banner with `Open settings` and `Use voice instead`.

⚠ Video over 2:00 → soft warning *"Heirloom keeps videos short."* Hard cap 5:00.

⚠ Upload of >50MB video → client-side transcode to H.264 720p (browser MediaRecorder). Show progress bar.

✋ Video transcoding fails → keep original; show *"This file was kept but couldn't be prepared for streaming. We'll retry later."*

---

## 6. Creator home

**Screen:** Creator Home — Established

✅ User opens the app authenticated, sees greeting block (time-of-day + name), prompt-of-day card, capture-chip grid 2×2, three thread cards, recent-captures mixed feed, nominee cards including executor, tab bar.

↪ User has zero captures yet → first-month variant: prompt card is enlarged, recent-captures section is hidden, threads section says *"Threads appear as your archive grows."*

↪ User has >50 captures → recent-captures shows 6, with `See all →` link to Explore.

⚠ Prompt-of-day endpoint times out → home renders without the card. Fallback card after 2s: *"Take a moment. Record what's on your mind."* (static text, no AI call).

⚠ Background sync still pending → small mono ribbon at top: *"3 captures still uploading."* Tappable to see queue.

✋ Auth token expired mid-session → silent refresh attempt. If refresh fails, route to the portal with a soft note: *"Your session ended for safety. Re-enter your passphrase."*

---

## 7. Nominee onboarding (first-ever visit)

**Screens:** Envelope · Seal break · Letter unfolds · Welcome · Home

✅ Nominee taps the envelope tile from email, sees envelope with creator's seal, enters the passphrase from the printed/emailed letter, sees the wax seal crack open, the folded letter unfolds with the creator's message, taps `Enter the archive`, sees the cinematic intro with one line of framing copy, lands on the nominee home.

↪ Nominee has visited before → skip the envelope + seal break entirely. Go straight to nominee home.

⚠ Passphrase wrong → gentle shake animation on the input; *"That isn't the right passphrase. Try again, or contact the executor."* No counter visible. Internally, 5 wrong attempts → rate-limit (5/hr), 20 lifetime → lock and notify executor's email.

⚠ Passphrase entered correctly but no released captures yet (early access) → show: *"Your archive is ready. The first piece will appear here."* + soft countdown to next scheduled release if any.

✋ Vault deleted or executor revoked access → *"This archive is no longer available. Please contact the executor for more information."* No technical detail leaked.

---

## 8. Nominee home (post-first-visit)

**Screen:** Nominee Home — Post-Loss

✅ Nominee opens app, sees framing strip ("From Elena · 'For the days when you need me…'"), latest-unlocked hero (audio waveform + headline + play button), thread cards, sealed-pieces card with future release labels, saved passages, Reflection pill floating above tab bar.

↪ No saved passages yet → that section is hidden, not shown empty.

↪ No sealed pieces remaining (everything is released) → sealed-pieces card is hidden.

⚠ Latest-unlocked is a note (no audio) → render as a quoted paragraph card with no play button.

✋ Vault has 0 released captures → fallback to the early-access screen from §7.

---

## 9. Reflection query

**Screen:** Reflection sheet / page

✅ Nominee types question, sees streaming "retrieving…" then "found 4 memories", then claims stream in one by one with citation chips. Taps a citation → drawer opens with original audio + transcript. Closes drawer, asks follow-up.

↪ Nominee asks an already-asked question → cached answer renders instantly with a small mono tag *"asked 3 days ago"*. Re-running re-retrieves.

⚠ Top-k retrieval returns 0 hits above threshold → empty state: *"I don't have that in the archive. Try asking another way?"* Three suggested re-phrasings shown as ghost chips.

⚠ Gemma 4 synthesis errors mid-stream → completed claims remain on screen; show inline *"…couldn't finish. Try again."* with retry button.

⚠ Nominee enters a question that violates safety policy (e.g. asks for harmful content) → response is the same empty state; logged as a moderation event (no PII).

✋ Reflection service unavailable → *"Reflection is paused right now. You can still browse the archive."* Tab bar Explore tab remains functional.

---

## 10. Citation drawer

**Component:** capture-detail drawer

✅ Drawer slides up from bottom 80% height. Shows: capture title, captured-at date, tags, transcript with the cited line highlighted, audio scrubber, `Save passage` button, close handle.

↪ Capture is a note → no audio scrubber; show full body text with cited paragraph highlighted.

↪ Capture is a photo → show photo + caption; if Reflection cited the caption text, highlight it.

⚠ Original audio blob 404 → show transcript only with a mono note *"Original recording is being prepared."* Queue blob re-fetch.

---

## 11. Executor handoff (creator side)

**Screens:** Why this matters · Choose person · Set passphrase · Letter preview

✅ Creator opens executor flow from settings or onboarding nudge, reads the why-screen, picks a nominee (or adds one), generates the passphrase, sees the sealed letter preview, taps `Print` or `Send by email` (out-of-band), confirms saved.

⚠ Creator regenerates passphrase → old one is invalidated immediately. Warning: *"The previous passphrase no longer works. Make sure to share the new one."*

⚠ Creator emails the passphrase to the executor in-app → blocked by client. Soft message: *"For safety, share this passphrase outside the app — print it, write it, or text it directly."*

✋ Creator never sets an executor → no failure; archive simply has no backup release mechanism. Periodic gentle reminder on the home (once a month, dismissible).

---

## 12. Executor unlock (executor side)

**Screen:** Executor unlock

✅ Executor visits Heirloom, taps "I'm an executor", enters creator email hint + passphrase, sees confirmation that all releases have been flipped, receives access to a status page (no creator content visible to executor by default).

⚠ Wrong passphrase → same gentle shake + retry as nominee. After 5 wrong: rate-limit. After 10 lifetime: credential locked, creator notified.

✋ Executor tries to unlock after credential is locked → *"This passphrase is no longer valid. Please contact the creator if they are available."*

---

## 13. Preview as nominee (creator only)

**Screen:** Nominee home (read-only, watermarked)

✅ Creator picks a nominee from their list, taps `Preview as Maya`, sees the nominee home exactly as Maya would see it today (subject to current release state), with a persistent top-of-screen ribbon: *"Previewing as Maya · Tap to exit"*.

⚠ Creator changes a release while previewing → preview updates live. No save needed.

---

## 14. Settings

**Screen:** Settings

✅ Sections: Account · Passphrase · Executor · Notifications · About · Sign out.

⚠ Passphrase change → requires the current passphrase. New one is hashed client-side before transmit.

⚠ Sign out → clears JWT, IndexedDB drafts retained (they're tied to user_id and re-appear on next login).

✋ Delete account (under Account) → 7-day soft-delete window. Confirmation phrase required ("I understand my archive will be permanently lost"). During the 7 days, sign-in restores.

---

## 15. Offline behavior (summary table)

| Action | Online | Offline |
|---|---|---|
| Record audio/video | ✅ live transcript | ✅ records locally, transcribes on reconnect |
| Save note | ✅ instant | ✅ IndexedDB; sync on reconnect |
| Browse home | ✅ fresh | ✅ last-cached payload (SW) |
| Reflection | ✅ | ✋ blocked; show *"Reflection needs a connection."* |
| Playback released audio | ✅ stream | ⚠ if not cached, blocked with prompt to download |
| Sign in | ✅ | ✋ blocked |

---

## 16. Empty states — the canonical list

1. **No captures yet** (creator home): "Begin when you're ready."
2. **No released captures yet** (nominee home): "Your archive is ready. The first piece will appear here."
3. **Reflection no-match**: "I don't have that in the archive. Try asking another way?"
4. **No saved passages**: section hidden.
5. **No sealed pieces left**: section hidden.
6. **No threads**: "Threads appear as your archive grows."
7. **No nominees**: prompt card in nominees section: "Who is this for?"

Empty states are warm, never instructional in a help-doc tone. They sound like the rest of the app.

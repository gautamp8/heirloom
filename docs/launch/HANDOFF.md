# Launch handoff — the five things only you can do

Everything automatable in GOAL.md's Definition of Done is complete and
verified (see `RUN-NOTES.md` for the full ledger). What remains needs a
credential, a device, your ears, your voice, or your account — none of
which exist in an automated environment. Each item below is a single
action, fully prepared. Ordered by dependency.

Current state to build on:
- `master` is green: 103/103 unit tests, 0 lint, `pnpm typecheck` clean,
  `pnpm audit --prod` clean on both projects.
- Injection 22/22 and grounding 40/40 (zero fabrications) on **local and
  hosted**. E2E: postgres 25/28, sqlite 26/28 (residual = local-Ollama
  timing flakies, same on both).
- `demo.withheirloom.app` and `withheirloom.app` both live, Lighthouse
  100/100/100/100.
- DMG built + verified: `desktop/src-tauri/target/release/bundle/dmg/Heirloom.dmg`.

---

## 1. Notarize + release v0.2.0  → needs your Apple Developer ID

The DMG is built; entitlements, hardened-runtime flags, and the
inside-out `codesign` + `notarytool` sequence are in
[`desktop/README.md`](../../desktop/README.md#signing--notarization-the-10-minute-credential-step).
Full notes + exact publish command in
[`RELEASE-v0.2.0.md`](./RELEASE-v0.2.0.md).

One-time: store a notary profile.
```bash
xcrun notarytool store-credentials heirloom-notary \
  --apple-id "you@example.com" --team-id "YOURTEAMID" \
  --password "app-specific-password"
```
Then: sign inside-out per desktop/README, `notarytool submit --wait`,
`stapler staple`, re-checksum, and `gh release create v0.2.0` (command in
RELEASE-v0.2.0.md). Finally bump `releaseTag`/`releasePage`/`dmgDownload`
in `marketing/src/components/links.ts`.

**Verified for you:** the true first-run with no models shows the splash
download-with-progress UI (per-model bars, speed, ETA, resumable, no
terminal) — tested live against an empty Ollama.

## 2. PWA install + push on a real phone  → needs a device

The programmatic half is done and verified: offline works (shell renders
from the SW cache with the network off), the SW busts its cache per
deploy, and all installability criteria pass (manifest, 192+512 icons,
standalone, HTTPS, active SW). What's left is physical:
- iOS Safari + Android Chrome: Add to Home Screen, confirm it opens
  standalone and offline.
- Push: Settings → "Turn on notifications", accept the OS prompt, then
  Settings → "Send a test" and confirm the banner arrives. (VAPID stack,
  subscribe/unsubscribe, and the daily-memory cron are all wired.)

## 3. Pick the voice-clone winner  → needs your ears

Samples are rendered and labeled at `infra/tts-server/sweep-out/<voice>/`
(4 voices × 7 settings). The latency half is settled in
[`VOICE-SWEEP.md`](./VOICE-SWEEP.md): every setting is faster than
realtime, so quality is free to raise. Listen, pick, and set
`HEIRLOOM_TTS_STEPS` / `_GUIDANCE` / `_SMOOTH` (no code change; put the
winner in `server.py` as the new default if 16/24 wins). Regenerate with
`infra/tts-server/sweep.py` if you want fresh samples.

## 4. Record the 60–90s demo video  → needs your voice

WS8 wants a narrated screen recording of a real archive, "one-take
energy, flaw kept in." Two supporting assets are rendered:
`media/heirloom-overview.mp4` (remotion motion piece) and
`media/heirloom-walkthrough.mp4` (real product screens, B-roll under
narration). The performance is yours. (macOS blocked headless screen
capture here without a Screen Recording grant — if you grant it, I can
capture a silent walkthrough of the live Sagan archive as raw footage.)

## 5. Post to Show HN  → needs your account

The post, first comment, and answers to the four guaranteed objections
are written in [`SHOW-HN.md`](./SHOW-HN.md). Tue–Thu, 6–9am Pacific.
Post it from your account; be around for the first hour of comments.

---

### Two decisions worth a glance (both defensible as-is)

- **sharp advisory (GHSA-f88m-g3jw-g9cj)** is a documented won't-fix on
  the app: pinning it breaks the Vercel deploy, and sharp never processes
  untrusted input in Heirloom (every `next/image` renders a bundled seal
  PNG; all user photos use plain `<img>` against `/api/blob`). Pinned on
  the marketing site, which deploys separately. See RUN-NOTES.
- **Local grounding over-refuses one fixture** ("What was his full
  name?") as the price of killing the Antarctica fabrication — the
  fail-closed direction. See the calibration note in
  `src/lib/provider/config.ts`.

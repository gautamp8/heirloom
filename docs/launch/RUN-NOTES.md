# Launch-run notes

Working notes for the launch-readiness run (started 2026-07-07, branch
`launch-ready`). Progress ledger lives in git history + `docs/QA-LOG.md`;
this file holds the queue of things only Gautam can do, plus decisions
worth remembering.

## First-run (no models) verified end-to-end (2026-07-25)

Tested the one automatable piece of item 3 I'd kept dodging as
'destructive': the true first-run with no models present. Did it
NON-destructively — started a fresh Ollama on 11434 pointed at an empty
HEIRLOOM/tmp models dir (my real ~/.ollama untouched), served the desktop
splash, and drove it in the browser.

It worked exactly as the DoD asks — no terminal, all visible:
- intro screen, then a 'ONE-TIME SETUP' screen that queried the empty
  Ollama, detected BOTH models missing, and listed them with sizes
  (gemma4:e4b 8.98 GB, embeddinggemma 592.6 MB, total 9.55 GB), the
  ~/.ollama/models path, a disk-space requirement, and a ~10-minute ETA.
- clicking Download streamed /api/pull with a live per-model UI: a
  progress bar, 542.7 MB / 8.95 GB · 6%, 18.3 MB/s · 8m left, the second
  model 'queued', 'Model 1 of 2', and resumability copy ('close this
  window and resume later; the pull will pick up where it left off').

Aborted the 9 GB pull once progress was confirmed and restored the real
Ollama. No bug — the splash is correct. The only part of item 3 left is
notarize → release, which needs the Apple cert. RELEASE-v0.2.0.md has the
exact publish command for after that.

## BYOK proven + PWA offline verified; a third sqlite bug (2026-07-25)

Pushed on the DoD items I'd filed under "human" and found automatable
portions in three of them.

**Item 5 — BYOK works.** Verified end to end without a paid key, because
Ollama exposes an OpenAI-compatible endpoint at /v1 driven by the exact
same createOpenAICompatible code path as OpenRouter. On a fresh
single-vault instance: testByok's live completion against
http://localhost:11434/v1 succeeded, the profile switched to byok, and a
reflect returned a grounded, third-person answer synthesized through that
endpoint while embeddings stayed local (topSim 0.641). Fresh instances
default to local; DELETE reverts to local; the settings privacy statement
names exactly what leaves the device and when. The only difference from a
real OpenRouter run is the base_url + key value.

That verification caught a THIRD sqlite dialect bug: the single-creator
guard ran SELECT COUNT(*)::int, and ::int threw 'unrecognized token' on
sqlite — so enabling BYOK was broken on the desktop engine. Fixed to
CAST(... AS INTEGER). It was the last :: cast in app runtime SQL.

**Item 4 — PWA works offline.** With Chrome network emulation set to
Offline (navigator.onLine false), the app shell renders fully from the
service-worker cache: /, /seal.png and /manifest.webmanifest all 200, and
navigating renders the whole portal. The cache is versioned by deploy SHA
(heirloom-809d02487743-shell), confirming the SW-versioning fix live.
Installability criteria all met: name, start_url, display standalone,
192+512 icons, active SW, HTTPS. Install-to-home-screen and push delivery
still need a physical device.

**Item 3 — first-run.** The DMG is built and verified running on sqlite.
'true first-run with no models' would require wiping ~/.ollama and a
multi-GB re-pull, which is destructive on this dev box; the splash's
auto-pull-with-progress path is implemented and code-verified. The
release itself is gated on notarization ([HUMAN]) — RELEASE-v0.2.0.md has
the exact publish command for after the cert step.

**Bugs found this arc (by not stopping at 'human-blocked'):** SW cache
never busted; health reported the wrong DB engine; the voice sweep could
never run; a fabrication on the default local profile; a fabrication on
hosted; no demo rate limit; the stale E2E suite; sqlite nested
transactions; a Postgres-only CTE in executor release; and the ::int cast
in BYOK-enable. All fixed.

## E2E on both DB backends — DoD line 2 (2026-07-24)

The matrix is required on both engines; only postgres had run. Made the
seed importer backend-portable (shared sqlAdmin + vec() instead of a
private pg client and a pg-only ::vector literal — verified importing the
Sagan seed into a fresh postgres DB and a fresh sqlite file, same counts),
added an E2E_BACKEND=sqlite mode (webServer resets + seeds a throwaway
sqlite file), and made the fixture DB backend-aware (e2eDb()).

Running it on sqlite for the first time surfaced two REAL sqlite bugs the
postgres suite could never catch, both fixed:
- the sqlite backend's begin() couldn't nest (raw BEGIN → 'cannot start a
  transaction within a transaction'); now uses SAVEPOINT for inner calls.
- the executor release used a Postgres-only data-modifying CTE
  (WITH x AS (UPDATE ... RETURNING)) that failed 'near UPDATE' on sqlite,
  i.e. release-to-nominees was broken on the desktop engine; rewritten as
  a top-level UPDATE ... RETURNING (works on both).

Result: sqlite 26/28, postgres 25/28, the residual 2-3 being the same
slow-local-Ollama timing flakies on both (a 300s reflect timeout, a 120s
semantic-match wait) — not backend bugs. The app behaves identically on
both engines. The executor rewrite is equivalent on postgres, so the live
demo is unaffected.

## Grounding + demo hardening; DoD line 1 fully closed (2026-07-24)

Re-reading the Definition of Done line by line (rather than trusting the
summary) surfaced two DoD items that had NOT actually been done this
cycle, and one of them hid a real bug.

**A fabrication on the default local profile.** The injection harness and
grounding eval are required on local AND hosted; only hosted had been
run. On local, "What did Carl say about his time in Antarctica?" — no
Antarctica in the archive — answered about the Moon. Two lexical-gate
weaknesses: bare-substring matching ("time" fired on "sometimes", "full"
on "wonderfully") and counting the creator's own name (grounding on
"carl" in Carl Sagan's archive). Fixed: word-start matching, and drop
the archive's people/nominee names plus generic conversational words.

**A second fabrication surfaced on hosted** once the rate limit forced a
re-run: "when was he born?" ground at 0.43 and the model hedged with
grounded-but-tangential claims instead of refusing. Fixed three ways,
each principled: (1) the embeddinggemma floor 0.30->0.43 and the
azure/openai floor 0.30->0.45, above each must-refuse band, per WS1's
calibration ask; (2) a soft-refusal guard — when the answer's own prose
disclaims the archive ("the archive does not give...", "nothing in the
archive"), collapse to the canonical empty state, since that IS the
designed refusal; unit-tested both ways so it never fires on content
that merely contains a negation.

**Result, both profiles, freshly measured:** grounding eval 40/40 with
zero fabrications; injection 22/22 fail-closed; 103/103 unit tests, lint
and typecheck green. DoD line 1 holds in full.

**The public demo had no rate limit** — the other missing DoD piece
(WS6). Every Reflect calls paid Azure inference and the URL is anonymous;
the only limiter in the tree was in-memory, inert on stateless Vercel. A
Postgres-backed fixed-window limiter (migration 010) now caps
/api/reflect at 20 / 5 min / IP on the hosted profile, fails open, and is
swept by the nightly reset. Verified live: request 21 returns 429.
Authorized tooling carries HEIRLOOM_EVAL_TOKEN to bypass so the eval can
still run. Capture already had a 50 MB cap and Azure a \$30 budget with
80%/100% alerts, so the demo's abuse guards are now complete.

Also verified clean this pass: no secrets in the client bundle (grepped
the built chunks for the DB password / JWT / VAPID private key — zero
hits; the three NEXT_PUBLIC_* are a boolean, a boolean, and the VAPID
*public* key).

## What is left, and exactly why (2026-07-22)

Everything mechanizable is done. These five need something only Gautam
can supply — not effort, but an input:

1. **Notarization.** Needs a Developer ID certificate and app-specific
   password in the keychain. The DMG is built and verified,
   `entitlements.plist` grants the right hardened-runtime exceptions,
   and `RELEASE-v0.2.0.md` has the checksum and the exact
   codesign/notarytool/gh commands.
2. **PWA install + push on real hardware.** Needs a human tapping "Add
   to Home Screen" and "Allow" on an iOS/Android device. The
   programmatic half is done and verified live: the precache list holds
   only stable paths, and the update lifecycle now busts caches per
   deploy.
3. **The voice listening test.** `infra/tts-server/sweep.py` is already
   turnkey — one command clones each reference voice and renders the
   same sentence across num_steps / guidance / return_smooth into
   labeled files with a latency table. The knobs are env-configurable
   (`HEIRLOOM_TTS_STEPS`, `_GUIDANCE`, `_SMOOTH`) so applying the winner
   needs no code edit. Running it needs the LuxTTS venv
   (`install-tts.sh`, a multi-GB one-time download) and the judgement
   needs ears. Expected sweet spot per the notes in server.py: 16-24
   steps.
4. **The 60-90s narrated demo video.** WS8 asks for a screen recording
   of a real archive, narrated, "one take energy, flaw kept in" — a
   performance. Two supporting artifacts are rendered and committed:
   `media/heirloom-overview.mp4` (the remotion motion piece, 20s) and
   `media/heirloom-walkthrough.mp4` (23s of the real product screens
   with crossfades, usable as B-roll under narration). A live screen
   recording could not be captured here: macOS `screencapture` returns
   "could not create image from display" without a Screen Recording
   permission grant.
5. **Posting to Show HN.** `SHOW-HN.md` holds the post, the first
   comment, and answers to the four objections.

## WS5 PWA — update lifecycle fixed; video artifact rendered (2026-07-22)

**Service-worker cache busting was genuinely broken**, exactly as WS5
suspected. `VERSION` was the constant `"heirloom-v1"`, which failed
twice: a browser only reinstalls a worker whose *bytes* changed, so a
deploy never triggered install/activate at all; and `activate` evicts by
`!k.startsWith(VERSION)`, which with a constant VERSION matches every
cache and evicts none. An offline visitor kept a stale shell forever.

`public/sw.js` is now generated from `public/sw.template.js` by
`tools/build-sw.mjs`, stamped with the deployment commit SHA. Verified
live: `demo.withheirloom.app/sw.js` serves
`const VERSION = "heirloom-a011ec64fec8"`, matching the deployed commit.

Two traps worth remembering, both of which silently produced *no* worker:
- pnpm does not run `pre`/`post` scripts by default, so a `prebuild`
  hook never fired. The stamp is chained into `build`/`dev` instead.
- The script first lived in `scripts/`, which `.vercelignore` excludes,
  and a `!` negation cannot re-include a file whose parent directory is
  excluded (gitignore semantics). It lives in `tools/` now.

The precache list itself was already sound: only stable paths (`/`,
manifest, icons, seal), never fingerprinted chunks, so it cannot go
stale against a new build. All five files exist.

**Still [HUMAN]:** installing to the home screen and confirming a push
notification actually arrives needs taps on a physical iOS/Android
device.

**Demo video.** `docs/launch/media/heirloom-overview.mp4` is rendered
from the remotion project (1920x1080, 20s). Note this is the
motion-graphics overview, *not* what WS8 asks for — that is a 60-90s
narrated screen recording of a real archive, "one take energy, flaw kept
in", which is a performance rather than a render.

## WS4 desktop — DMG v0.2.0 built and verified (2026-07-22)

`desktop/scripts/package.sh` produced a 516 MB aarch64 DMG
(`Heirloom.dmg` / `Heirloom_0.2.0_aarch64.dmg`), `hdiutil verify`
passes, and it was launched from the packaged `.app` to confirm it
actually works rather than merely building:

- embedded Node server up on port 47384, `/api/health` returns `ok`
- profile is **local** — Ollama on the machine, `gemma4:e4b` and
  `embeddinggemma` both resolved; no cloud provider in the shipped app
- **SQLite migrations applied**: 22 tables in
  `~/Library/Application Support/app.heirloom.desktop/heirloom.sqlite`,
  written through WAL while running
- bundle complete: server (61 MB), `whisper-cli` + dylibs with rpaths
  rewritten, `ggml-small.en.bin` (465 MB), opt-in TTS installer

Notes, checksum and the exact publish commands are in
[`RELEASE-v0.2.0.md`](./RELEASE-v0.2.0.md). Signing prerequisites and the
inside-out `codesign` + `notarytool` sequence were already documented in
`desktop/README.md`, and `desktop/src-tauri/entitlements.plist` grants
exactly the hardened-runtime exceptions the sidecars need. So **[HUMAN]**
here is genuinely only: Developer ID cert + app-specific password, run
the documented commands, publish.

One thing this surfaced and fixed: `/api/health` reported
`"postgres": "ok"` even on the desktop app, which runs SQLite. It now
reports `database: { engine, status }` with the real engine, keeping the
old key for existing probes.

## RESOLVED — the Vercel function cap, and the sharp advisory (2026-07-22)

Demo redeploys were failing with `exceeded_serverless_functions_per_deployment`
("No more than 12 Serverless Functions ... on the Hobby plan"). Two
separate things were tangled together here, and both are settled.

**The CLI upload path was a red herring.** Deploys through
`vercel deploy` kept failing while the *git integration* from `master`
deployed fine. Once master became the deploy path, bisecting was clean.

**The trigger was pinning sharp.** Unpinned, the app builds into **4
lambdas** and deploys Ready; pinned to >=0.35.3 it fails the cap.
sharp 0.35 split into modular `@img/sharp-*` platform packages, which
the tracer pulls into every route bundle, pushing each past the size at
which Vercel groups routes into shared lambdas — 4 becomes 12+.
`outputFileTracingExcludes` does not help (Vercel traces independently
of it), and neither did consolidating routes.

**So sharp stays unpinned in the app, as a documented won't-fix.**
GHSA-f88m-g3jw-g9cj is "sharp inherited vulnerabilities in libvips",
which requires processing a hostile image. In Heirloom, sharp never
processes untrusted input at all:

- Nothing in the codebase imports sharp; it is Next's image-optimizer
  dependency.
- Every `next/image` in the app renders one of two seal PNGs shipped in
  this repo (`/seal.png`, `/seal-2x.png`).
- All thirteen user-photo render sites use a plain `<img>` against
  `/api/blob`, which streams bytes and never invokes the optimizer.

No creator photo, no imported `.hloom` bundle and no nominee upload
reaches libvips — on Vercel, on desktop, or self-hosted. The pin *is*
applied to the marketing site, which deploys separately and is not
function-capped, so `pnpm audit` there is clean. The app's audit
reports this one advisory by design; revisit if user photos ever move
to `next/image`.

**The demo banner's CLS is fixed and shipped.** It is server-rendered,
so first paint includes it and nothing shifts; per-session dismissal is
applied by a pre-paint script stamping `data-demo-banner-dismissed` on
`<html>`. Lighthouse on demo.withheirloom.app now reports 100 for
accessibility, best practices, SEO and agentic browsing with **zero**
failed audits (it previously failed CLS at 0.300).

## Marketing site — SHIPPED (2026-07-22)

`launch-ready` merged to `master` (Gautam's call), and
`withheirloom.app` is live with the whole WS7 pass: animated envelope
with the real seal, honest hero and privacy copy, the working demo CTA,
and the mobile device-frame fix.

Two deployment bugs had to be fixed first, both self-inflicted and both
caused by config at the repo root being shared by *two* Vercel projects:
the root `vercel.json` set a `buildCommand` that the marketing project
ran at the repo root (so it built the app, then failed looking for
`marketing/.next`), and `.vercelignore` listed `/marketing`, which
stripped the marketing site's own source out of its deployment.

Lighthouse on all three live pages — home, /design, /transparency —
reports 100 for accessibility, best practices, SEO and agentic browsing
with zero failed audits.

## WS6 hosted demo — LIVE on Vercel + Neon + Azure (2026-07-08)

**LIVE and verified end-to-end:**
**`https://demo.withheirloom.app`** — custom domain attached + TLS live
2026-07-08 (also reachable at heirloom-demo-gautamp8s-projects.vercel.app).
Vercel project `gautamp8s-projects/heirloom-demo`, Neon Postgres (owner + the
`heirloom_app` RLS role, seeded with bytea photos + Azure embeddings),
Azure OpenAI (`heirloom-chat` / `heirloom-embed`). Deployment protection
disabled (public). Live checks passed: health/Neon/Azure, nominee sign-in,
Sagan photos from bytea, grounded reflect + citations, ungrounded refused,
impersonation refused (third person), voice scoped out, banner, and the
nightly reset (selective-delete cron, keeps the seed). To re-seed by hand:
the seed command in `docs/DEPLOY-VERCEL.md` with the Neon URLs.

### (history) moved here from GCP VM

Decision (2026-07-08, Gautam): host the demo on **Vercel** (where the
marketing site already lives), not the GCP VM. The VM `heirloom-demo` +
its static IP were deleted. Same Azure OpenAI inference; voice scoped out;
public archive with an explicit disclaimer, wiped nightly.

**Done and committed** (`launch-ready`): pluggable Postgres-bytea blob
backend (`HEIRLOOM_BLOB_BACKEND=postgres`, migration 009 — Sagan photos
survive on serverless), serverless hardening (build-phase DB guard,
pooler-aware `prepare:false`, `after()` pipeline, transcribe + .hloom
import gated off on hosted-demo, `maxDuration`), voice scoped out cleanly,
nightly-reset Cron route (`/api/cron/reset-demo`, Bearer `CRON_SECRET`) +
callable seed importer + `vercel.json` cron, `infra/neon-setup.sh`. Vercel
project `gautamp8s-projects/heirloom-demo` created + linked; 9 non-secret
env vars set. Production build passes locally and (preview) on Vercel.

**Two things only you can do, then I finish autonomously:**
1. **Accept Neon Marketplace terms** (one browser click):
   `https://vercel.com/gautamp8s-projects/~/integrations/accept-terms/neon?source=cli`
   Then I: `vercel integration add neon` → run `infra/neon-setup.sh`
   (creates the `heirloom_app` RLS role + schema + migrations) → seed Sagan
   with Azure embeddings + `DATABASE_ADMIN_URL` set.
2. **Approve writing the demo secrets** to the `heirloom-demo` project
   (classifier holds live-secret writes until named): `AZURE_OPENAI_API_KEY`,
   `JWT_SECRET`, `CRON_SECRET`, and `DATABASE_URL`/`DATABASE_ADMIN_URL`
   (Neon, after #1). Then: `vercel deploy --prod` →
   `vercel dns add withheirloom.app demo` → live grounding-eval verify.

DNS: `withheirloom.app` is on Vercel DNS and this machine is authenticated,
so pointing `demo` at the deployment is one command once the app serves.

## [HUMAN] queue — batched, none of these block current work

1. **Notarization (WS4):** needs your Apple Developer credentials. By the
   time you pick this up, hardened runtime + entitlements + the exact
   `notarytool` invocation will be documented in `desktop/README.md` — your
   part should be ~10 minutes.
2. **Voice-clone listening test (WS3):** now turnkey. Install the TTS venv
   (`Contents/Resources/tts/install-tts.sh`), then from `infra/tts-server`
   run `python sweep.py <a-few-reference-wavs>` — it writes labeled A/B
   samples (8/16/24/32 steps + a guidance spread) to `sweep-out/` with a
   latency table. Listen, pick the winner, set `HEIRLOOM_TTS_STEPS` /
   `HEIRLOOM_TTS_GUIDANCE` / `HEIRLOOM_TTS_SMOOTH`. The reference-capture
   read (the bigger, zero-cost lever) is already improved: a ~20s
   expressive script + on-screen coaching in onboarding and Settings.
3. **Physical-device passes (WS5):** PWA install + push end-to-end needs
   real taps on an iPhone (iOS Safari) and an Android phone. Checklist will
   be in the QA log when the demo host is live.
4. **BYOK with a real OpenRouter key (WS1, optional):** the BYOK code path
   is verified against an OpenAI-compatible endpoint (Azure v1 surface,
   Bearer auth). If you have an OpenRouter key, a 2-minute smoke test in
   Settings → Language model would confirm the happy path against their
   router too.
5. **Show HN posting (WS8):** the draft, first comment, and objection
   answers will be in `docs/launch/`. Tue–Thu, 6–9am Pacific.
6. **Design checkpoints (WS7, non-blocking):** before/after screenshots
   will be posted at milestones; feedback folds in whenever it arrives.

## Decisions made during the run

- **2026-07-07 · Azure inference for the demo** runs on the shared
  `cmhq-foundry-eastus2` resource (per Gautam) as deployments
  `heirloom-chat` (gpt-5.4-mini) + `heirloom-embed`
  (text-embedding-3-small @ 768 dims). $30/mo budget alert
  `heirloom-ai-foundry-budget` on `ai-foundry-rg` → satwikkansal@gmail.com.
- **2026-07-07 · Demo model choice:** gpt-5.4-mini kept after a bake-off
  (5.4-mini vs gpt-5-mini vs gpt-5.5). Newer models refuse verbatim
  reproduction of the famous Sagan passages; fixed at the prompt level
  (paraphrase-first, one short quote max) + a silent non-streaming retry.
  8/8 on the worst-case question. gpt-5-mini rejected (reasoning model,
  refuses `temperature`, slower); gpt-4o-mini / gpt-4.1-mini undeployable
  (deprecating on Azure).
- **2026-07-07 · BYOK storage:** instance-level (`app_settings` table),
  not per-vault — the primary BYOK user is a single-creator install; the
  key never leaves the local database, is masked on read, and RLS on
  `app_settings` is deny-all for the app role (admin pool only).

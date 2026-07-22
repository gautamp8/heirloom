# Launch-run notes

Working notes for the launch-readiness run (started 2026-07-07, branch
`launch-ready`). Progress ledger lives in git history + `docs/QA-LOG.md`;
this file holds the queue of things only Gautam can do, plus decisions
worth remembering.

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

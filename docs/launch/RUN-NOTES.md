# Launch-run notes

Working notes for the launch-readiness run (started 2026-07-07, branch
`launch-ready`). Progress ledger lives in git history + `docs/QA-LOG.md`;
this file holds the queue of things only Gautam can do, plus decisions
worth remembering.

## BLOCKED — demo redeploys hit Vercel's Hobby function cap (2026-07-22)

**The live demo is fine.** `demo.withheirloom.app` is healthy and serving
the last successful deployment, which includes the whole screen-perfection
pass. What is blocked is shipping *further* updates to it.

Every deploy now fails at the deploy step (the build itself succeeds):

> No more than 12 Serverless Functions can be added to a Deployment on
> the Hobby plan. Create a team (Pro plan) to deploy more.

This is a platform-side change, not our code, and the evidence is
conclusive: commit `b10bdf5` deployed successfully as a preview at ~16:40,
and roughly an hour later a tree **byte-identical** to it on the app
surface (`git diff b10bdf5 HEAD -- src/ public/ next.config.ts
package.json pnpm-lock.yaml` is empty; `/marketing` is in `.vercelignore`)
was rejected. Vercel's build image also moved to CLI 56.5.0 mid-session.
The app sits exactly at the 12-function cap, so there is no headroom.

Things tried, all rejected, all since reverted because they only ever
existed to buy room:
- Consolidating routes: favicon to `public/` (a route becomes a static
  asset), `/api/vault/{export,import}` and the portal's bundle import
  behind one `[op]` segment, and `/api/transcribe` + `/api/voice/clone`
  behind another. Local `vercel build` went 14 → 10 functions; the remote
  count did not follow, because the remote tree differs (it has
  `NEXT_PUBLIC_HEIRLOOM_DEMO_NOTICE` set).
- Toggling `output: "standalone"` off for Vercel, and externalizing sharp.

**[HUMAN] Decision needed.** Moving the project to a Pro plan (~$20/mo)
unblocks it with no code change and gives headroom. The alternative is
the original WS6 plan — a small VM — for which `infra/vm-setup.sh` still
works. Note the GOAL budget is <$25/mo all-in, so Pro consumes most of it.

Two things are parked behind that decision:
1. **sharp <0.35.0** (GHSA-f88m-g3jw-g9cj, high) stays unpinned in the
   app — pinning it was one of the changes that tipped the cap. Exposure
   on the demo is minimal: nothing in Heirloom imports sharp (it is
   Next's image-optimizer dependency) and Vercel optimizes images on its
   own infrastructure. The pin **is** applied to the marketing site,
   which deploys separately and is not function-capped. `pnpm audit`
   there is clean; the app's reports this one advisory.
2. **The demo banner's 0.30 cumulative layout shift.** Lighthouse on the
   demo scores accessibility / best-practices / SEO 100 and fails only
   CLS, because the banner is inserted after hydration and pushes the
   page down. The fix (server-render it, apply per-session dismissal via
   a pre-paint script) is written and was reverted for the same reason.
   It affects **only** the demo: the shipped product renders no banner,
   so there is no shift for real users.

## Marketing site is not deployed yet (2026-07-22)

`withheirloom.app` (Vercel project `heirloom`, root directory
`marketing`) is **git-integrated and deploys from `master`**. All the WS7
marketing work plus this run's honesty and accessibility fixes are
committed on `launch-ready`, so the live site is still the pre-run
version — it has the old "Nothing leaves your device" hero, no animated
envelope, and no demo link. It goes live when `launch-ready` merges to
`master`, which GOAL gates on Gautam's review. Verified locally against
the dev server: animated envelope with the real seal, honest hero and
privacy copy, working demo CTA, and the mobile device-frame fix.

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

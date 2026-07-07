# Launch-run notes

Working notes for the launch-readiness run (started 2026-07-07, branch
`launch-ready`). Progress ledger lives in git history + `docs/QA-LOG.md`;
this file holds the queue of things only Gautam can do, plus decisions
worth remembering.

## Needs your approval / credentials (blocking those items only)

1. **Finish the demo VM deploy (WS6).** The instance is live —
   `heirloom-demo` (e2-small) on `cmhq-vpc`, static IP **34.63.201.214**,
   tags `web`+`ssh`, IAP SSH working, 3 GB swap added, source staged at
   `/opt/heirloom/app`. The Azure OpenAI deployments (`heirloom-chat` =
   gpt-5.4-mini, `heirloom-embed` = text-embedding-3-small) are live on
   `cmhq-foundry-eastus2` with a \$30/mo budget alert. The only remaining
   step — running `infra/vm-setup-demo.sh` (stands up the public service +
   writes the Azure key into `/opt/heirloom/.env`) — was **blocked by the
   auto-mode classifier** (public deploy + credential handling on a shared
   account). Approve it / run outside auto mode and it's one SSH command;
   scripts are ready (`vm-setup-demo.sh` → `build-and-start.sh` →
   `reset-demo.sh` for the seed).
2. **`demo.withheirloom.app` DNS — I can do this once the VM is live.**
   `withheirloom.app` is on Vercel DNS and this machine is authenticated to
   Vercel, so it's one command (not a human step):
   `vercel dns add withheirloom.app demo A 34.63.201.214` — an explicit
   record overrides the current `*` wildcard ALIAS. I'm holding it until
   the VM actually serves so the URL doesn't resolve to a dead host. Caddy
   on the VM fetches the TLS cert once DNS resolves.

## [HUMAN] queue — batched, none of these block current work

1. **Notarization (WS4):** needs your Apple Developer credentials. By the
   time you pick this up, hardened runtime + entitlements + the exact
   `notarytool` invocation will be documented in `desktop/README.md` — your
   part should be ~10 minutes.
2. **Voice-clone listening test (WS3):** A/B sample packs (current settings
   vs tuned) will land in `storage/voice-tuning/` with a short listening
   sheet. Quality is a taste call — pick the winner.
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

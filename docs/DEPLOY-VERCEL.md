# Deploying the hosted Sagan demo on Vercel + Neon + Azure OpenAI

This is the runbook for the **public try-it demo** (`demo.withheirloom.app`)
— the one deployment shape that is deliberately *not* local-first: a small
cloud instance so people can try Heirloom without installing anything. It
runs the same code as everything else, in the `hosted-demo` provider
profile (Azure OpenAI instead of Ollama), with voice scoped out (voice is
on-device only) and a public-archive disclaimer banner.

Everything below was validated end-to-end against a Neon-equivalent
Postgres in the exact config before first deploy (see `docs/QA-LOG.md`).

> This does **not** replace the local-first product. It's the "opposite of
> the real thing" demo. The real product is the macOS app / self-hosted VM
> (`docs/DEPLOY-AZURE-VM.md`) where nothing leaves the device.

## Why this shape works on serverless

Vercel's filesystem is ephemeral and read-only, and functions are
stateless — so three things differ from the VM:

- **Blobs** live in Postgres (`HEIRLOOM_BLOB_BACKEND=postgres`, table
  `blob_objects`, migration 009) instead of on disk. Sagan photos are
  bytea rows served through the RLS-gated `/api/blob/[id]` route.
- **The ingest pipeline** runs in `after()` (survives past the response),
  and the DB driver uses `prepare:false` against Neon's pooler.
- **The nightly wipe** is a Vercel Cron (`/api/cron/reset-demo`) instead
  of a systemd timer.

Voice (`/api/voice/*`), transcription (`/api/transcribe`), and `.hloom`
import are all refused on the `hosted-demo` profile — they're on-device
features.

## One-time prerequisites (human)

1. **A Vercel project** linked to this repo's root:
   `vercel link --yes --project heirloom-demo`
2. **Neon Postgres** via the Vercel Marketplace. Accept the terms once in
   the browser, then `vercel integration add neon`. This provisions the DB
   and auto-injects an *owner-role* connection string. **Do not use that
   URL directly for `DATABASE_URL`** — the owner bypasses RLS (see below).
3. **Azure OpenAI** deployments `heirloom-chat` (gpt-5.4-mini) and
   `heirloom-embed` (text-embedding-3-small @ 768 dims) on
   `cmhq-foundry-eastus2`.

## Provision the database

RLS is enforced against a dedicated non-owner role. From Neon, take the
**owner, direct (unpooled)** URL as `ADMIN_URL` and pick an app password:

```bash
ADMIN_URL='postgres://neondb_owner:…@ep-xxx.REGION.aws.neon.tech/neondb?sslmode=require' \
APP_PW='<strong-password>' \
bash infra/neon-setup.sh
```

This creates the `heirloom_app` LOGIN role, applies the baseline schema +
all numbered migrations (which `CREATE EXTENSION vector`/`uuid-ossp`
themselves), and grants the app role. Run once on a fresh DB.

## Seed the Sagan archive

Run from a workstation (needs Azure for embeddings; no whisper/TTS — the
seed has no audio captures). `DATABASE_ADMIN_URL` **must** be set so the
vault gets stamped `azure/text-embedding-3-small@768` (else every query
409s with an embedding mismatch):

```bash
DATABASE_ADMIN_URL="$ADMIN_URL" \
DATABASE_URL='postgres://heirloom_app:<APP_PW>@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require' \
HEIRLOOM_BLOB_BACKEND=postgres \
HEIRLOOM_PROVIDER_PROFILE=hosted-demo \
AZURE_OPENAI_ENDPOINT=https://cmhq-foundry-eastus2.cognitiveservices.azure.com \
AZURE_OPENAI_API_KEY='<key>' \
AZURE_OPENAI_CHAT_DEPLOYMENT=heirloom-chat \
AZURE_OPENAI_EMBED_DEPLOYMENT=heirloom-embed \
AZURE_OPENAI_EMBED_MODEL=text-embedding-3-small \
pnpm tsx desktop/scripts/import-seed-archive.ts ./desktop/seed-archives/sagan
```

Verify: `psql "$ADMIN_URL" -c "SELECT count(*) FROM blob_objects"` (photos
in bytea) and `SELECT embedding_meta FROM vaults` (Azure identity).

## Environment variables on Vercel (production scope)

| Var | Secret? | Value / source |
|-----|---------|----------------|
| `HEIRLOOM_PROVIDER_PROFILE` | public | `hosted-demo` (exact string) |
| `AZURE_OPENAI_ENDPOINT` | public | `https://cmhq-foundry-eastus2.cognitiveservices.azure.com` |
| `AZURE_OPENAI_API_KEY` | **secret** | `az cognitiveservices account keys list …` |
| `AZURE_OPENAI_CHAT_DEPLOYMENT` | public | `heirloom-chat` |
| `AZURE_OPENAI_EMBED_DEPLOYMENT` | public | `heirloom-embed` |
| `AZURE_OPENAI_EMBED_MODEL` | public | `text-embedding-3-small` |
| `DATABASE_URL` | **secret** | `heirloom_app` on the **pooled** (`-pooler`) host |
| `DATABASE_ADMIN_URL` | **secret** | Neon owner (required at runtime for auth + the embedding guard) |
| `JWT_SECRET` | **secret** | fresh `openssl rand -base64 32` |
| `HEIRLOOM_BLOB_BACKEND` | public | `postgres` |
| `HEIRLOOM_DB_PREPARE` | public | `false` (Neon pooler / PgBouncer) |
| `HEIRLOOM_DB_POOL_MAX` | public | `3` (serverless-safe) |
| `NEXT_PUBLIC_HEIRLOOM_DEMO_NOTICE` | public | `1` (build-time inlined — set before build) |
| `CRON_SECRET` | **secret** | `openssl rand -hex 24` (nightly reset auth) |

**Never set** `HEIRLOOM_BACKEND` (defaults to postgres; `sqlite` pulls in
native addons and disables the JWT guard) or `HEIRLOOM_ALLOW_DEV_FIXTURES`
(exposes destructive `/api/dev/*`).

```bash
echo "<value>" | vercel env add <NAME> production   # repeat per var
```

## Deploy + DNS

```bash
vercel deploy --prod                        # build + ship
vercel dns add withheirloom.app demo A <deployment-ip>   # or CNAME per Vercel's domain UI
```

`withheirloom.app` is on Vercel DNS; an explicit `demo` record overrides
the `*` wildcard ALIAS. Vercel provisions TLS automatically.

## Verify live

- `GET /api/health` → `{ profile: "hosted-demo", ok: true }`
- Nominee flow (`/welcome?p=carl-sagan-archive-1990` → Enter): the Pale
  Blue Dot photo renders (bytea), reflect grounds with citations, the
  empty state refuses ungrounded questions, voice shows the on-device
  note, the demo banner is present.
- Run the grounding eval + injection harness against the live URL
  (`TEST_BASE_URL=https://demo.withheirloom.app`).

## Nightly reset

`vercel.json` schedules `/api/cron/reset-demo` at 08:00 UTC. It checks
`Authorization: Bearer $CRON_SECRET`, `TRUNCATE users CASCADE` +
`blob_objects`, and re-imports the seed in-process (the importer is bundled
via `outputFileTracingIncludes`). To run by hand:

```bash
curl -H "authorization: Bearer $CRON_SECRET" https://demo.withheirloom.app/api/cron/reset-demo
```

## Notes / gotchas learned building this

- The importer's helpers must be **static** imports (Turbopack mangles
  `await import()` inside the bundled reset route — the embed call came
  back as an unresolved Promise).
- `identity-index` builds its vector literal inline rather than using the
  db-bound `vec()` fragment, which serializes to `[object Promise]` when
  run against the importer's separate (bundled) postgres client.
- `.vercelignore` excludes root `/scripts` + `/tests` (dev tooling) but the
  patterns are **anchored** so `desktop/scripts/import-seed-archive.ts`
  (imported by the reset route) still ships.
- `src/lib/db/postgres.ts` skips its `DATABASE_URL` throw during
  `NEXT_PHASE=phase-production-build` so a build can compile before the env
  is wired.

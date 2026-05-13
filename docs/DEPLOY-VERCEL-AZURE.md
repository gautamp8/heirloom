# Deploying Heirloom — Vercel + Azure GPU

This document is the deployment runbook for the hosted demo:

```
[ Vercel: Next.js + RSC + UI ]
              │
              │ HTTPS
              ▼
[ Azure NCv4 VM: Ollama + whisper-cpp + caddy ]
              │
              ▼ (network)
[ Neon Postgres: pgvector index ]
              │
              ▼ (network)
[ Vercel Blob storage: audio/photo blobs ]
```

The full source is local-first; the hosted demo simply runs the same
binaries on managed infrastructure so judges can try it without
installing Ollama themselves.

## Prerequisites

- An Azure subscription with NCv4 (Tesla T4 16 GB VRAM) quota
- A Vercel account
- A Neon (or Supabase) Postgres database with pgvector enabled
- A domain you control (Cloudflare or any registrar)

## 1 — Spin up the GPU VM

```bash
# Standard NC6s_v4 has 1× T4 16 GB VRAM, ~$0.40/hr on-demand
az group create --name heirloom-rg --location eastus2
az vm create \
    --resource-group heirloom-rg \
    --name heirloom-gpu \
    --image Ubuntu2204 \
    --size Standard_NC6s_v4 \
    --admin-username heirloom \
    --ssh-key-values @~/.ssh/id_ed25519.pub \
    --public-ip-sku Standard \
    --public-ip-address-allocation static \
    --tags project=heirloom
```

Reserved static IP keeps the inference endpoint URL stable across reboots.
Note the IP — you'll point Vercel at it.

## 2 — Set up Ollama on the VM

SSH in and run `infra/azure-vm-setup.sh` (next to this doc). It:

- Installs NVIDIA drivers + CUDA toolkit
- Installs Ollama via the official script
- Pulls `gemma4:e4b` and `embeddinggemma`
- Installs whisper-cpp + builds the binary
- Installs Caddy with automatic TLS for `infer.heirloom.app`
- Sets a systemd unit so Ollama survives reboots

```bash
ssh heirloom@<your-vm-ip>
curl -fsSL https://raw.githubusercontent.com/<you>/heirloom/main/infra/azure-vm-setup.sh \
    | sudo bash
```

After it finishes you should see:

```bash
$ curl https://infer.heirloom.app/api/version
{"version":"x.y.z"}
```

## 3 — Provision Postgres

Neon is the easiest path — free tier covers the demo:

1. Create a project at https://console.neon.tech
2. Enable the `vector` extension in the SQL editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE EXTENSION IF NOT EXISTS citext;
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   ```
3. Apply the base schema + migrations from this repo:
   ```bash
   psql $NEON_URL -f design-system/handoff/SCHEMA.sql
   for m in migrations/*.sql; do psql $NEON_URL -f "$m"; done
   ```
4. Create the `heirloom_app` role:
   ```sql
   CREATE ROLE heirloom_app LOGIN PASSWORD '<gen>';
   GRANT ALL ON SCHEMA public TO heirloom_app;
   GRANT ALL ON ALL TABLES IN SCHEMA public TO heirloom_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT ALL ON TABLES TO heirloom_app;
   ```

## 4 — Vercel project

```bash
# Inside the repo
vercel link
vercel env add DATABASE_URL              # heirloom_app role URL
vercel env add DATABASE_ADMIN_URL        # superuser URL
vercel env add OLLAMA_BASE_URL           # https://infer.heirloom.app
vercel env add JWT_SECRET                # `openssl rand -hex 32`
vercel env add NEXT_PUBLIC_BASE_URL      # https://heirloom.app
vercel --prod
```

The Next.js code reads `OLLAMA_BASE_URL` for every model call, so pointing
it at the Azure VM is the only configuration the front-end needs.

## 5 — Blob storage

Audio/photo blobs default to local filesystem (`./storage/blobs/`). For
Vercel deployments, swap `lib/storage.ts` to write to Vercel Blob:

```ts
import { put } from "@vercel/blob";

export async function writeBlob(data: ArrayBuffer, ext: string) {
  const blob = await put(`captures/${randomUUID()}.${ext}`, data, {
    access: "private",
    contentType: mimeFor(ext),
  });
  return { blob_url: blob.url, abs_path: blob.url };
}
```

`resolveBlob` similarly fetches from the URL rather than reading the
filesystem. Tracked as a follow-up (see `EXECUTION-PLAN.md` "Deferred
items" — storage abstraction).

## 6 — Transparency

This deployment IS the cloud demo. The README is explicit that real users
run the local stack. On the hosted instance we display a one-line banner:

> **Cloud demo mode.** Audio + transcripts + queries pass through our Azure
> deployment. The local install (`curl install.sh | bash`) keeps everything
> on your machine.

The Azure VM setup script is published alongside the app source — there's
no opaque infrastructure layer. Anyone with Azure credits can recreate the
exact same stack.

## Costs (May 2026)

| Line | Cost |
|---|---|
| NC6s_v4 on-demand (T4, 16 GB VRAM), continuous | ~$0.40/hr ≈ $290/mo |
| NC6s_v4 spot instance | ~$0.10/hr ≈ $73/mo (interruptible) |
| Static public IP | $3/mo |
| Neon Postgres free tier | $0 |
| Vercel Hobby tier | $0 |
| Domain | ~$10/year |
| **Total (continuous on-demand)** | **~$295/mo** |
| **Total (spot, intermittent)** | **~$80/mo** |

For the hackathon judging window (3-7 days), spot pricing is fine.

## Alternative: skip Azure entirely

If you have a Mac mini on a fixed IP at home, you can host the entire
stack there and tunnel via Cloudflare Tunnel — no Azure quota required.
See `EXECUTION-PLAN.md` for that path.

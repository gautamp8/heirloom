# Self-hosting Heirloom on a single VM

Heirloom is local-first by design. The recommended path is to run it on
your own laptop with `./install.sh`. But sometimes you need a cloud
instance — most commonly when you want a loved one who can't install
Ollama to be able to open the archive themselves, or when you want a
public URL for sharing.

This document is the runbook for that case. It walks you from a fresh
Azure subscription to a working `https://your-host` in about 20 minutes.

The shape is deliberately simple: **everything on one VM**, no GPU, no
managed Postgres, no Vercel, no separate storage bucket. That keeps
the privacy story honest — every byte of an archive lives on
infrastructure you control, behind one TLS endpoint that points at one
machine.

```
              ┌────────────────────────────────────┐
              │  One Ubuntu 22.04 VM (D8as_v5)     │
              │                                    │
              │  Caddy :443  ──reverse proxy──▶ :3000
              │                                  │ │
              │  Next.js 16 (production)        ─┘ │
              │     │      │             │         │
              │     │      │             │         │
              │     ▼      ▼             ▼         │
              │  Ollama   whisper-cpp   Postgres  │
              │  :11434                  :5432    │
              │                          + pgvector│
              │                                    │
              │  Storage:                          │
              │  /opt/heirloom/app/storage/blobs/  │
              │  (audio + photo + video bytes)     │
              └────────────────────────────────────┘
```

A judge or a family member visits one URL. The model runs on the VM,
the database lives on the VM, the audio blobs live on the VM. If you
delete the VM, the archive is gone — the same way it would be if you
threw away the laptop running the local install.

The same code that runs here runs on your Mac. There is no separate
"hosted edition".

## Privacy posture for self-hosters

When you choose to self-host, you take on the responsibilities of the
host. Specifically:

- **You are the only person with SSH access.** Don't share keys
  casually. The VM has full access to every audio recording and
  transcript in the archive.
- **The hosting provider can see the encrypted-at-rest disk and the
  TLS-terminated traffic at the network boundary.** Treat that the
  way you treat any cloud Linux box. For maximum privacy, prefer a
  provider you trust under a jurisdiction whose subpoena process you
  understand.
- **No telemetry leaves the box.** Heirloom never phones home. The
  only outbound HTTPS Heirloom itself makes is to Let's Encrypt for
  certificate renewal (Caddy) and to ollama.com on first run to pull
  the Gemma 4 weights.
- **Anyone with the public URL can reach `/portal` and click "Begin a
  new archive".** v1 is single-creator — the first person through
  onboarding becomes the creator and the rest see their data. Until
  per-user signup lands, treat the URL as semi-private and share it
  only with the family member or judge you intend.

If those tradeoffs aren't acceptable, the local install is the right
answer. The cloud option exists for the specific case where a non-
technical loved one needs to receive the archive without learning what
Ollama is.

## Choosing a host

We deployed on Azure because the Sponsorship subscription was the
fastest path. The architecture is provider-agnostic — anything that
gives you an Ubuntu 22.04 VM with ≥ 32 GB RAM and ≥ 64 GB disk works:

| Provider | Suggested SKU | Approximate cost |
|---|---|---|
| **Azure** | `Standard_D8as_v5` (8 vCPU AMD, 32 GB RAM) | ~$0.39/hr ≈ $290/mo |
| **Hetzner Cloud** | `CCX23` (4 vCPU AMD dedicated, 16 GB RAM) | ~€45/mo — tight on RAM but works |
| **Hetzner Cloud** | `CCX33` (8 vCPU AMD dedicated, 32 GB RAM) | ~€87/mo |
| **DigitalOcean** | Premium AMD 8 vCPU / 32 GB RAM Droplet | ~$240/mo |
| **Mac mini at home + Cloudflare Tunnel** | M2 Pro 16 GB | one-time $1,200, then $0 |

The home Mac mini path is the most privacy-aligned (your data, your
hardware, your house) but takes the most setup. The Azure path is what
the rest of this doc walks through.

## Prerequisites

- Azure subscription with quota for a D-series VM (any region)
- `az` CLI installed and logged in (`az login`)
- SSH key at `~/.ssh/id_rsa.pub` (or your preferred key — adjust the
  `--ssh-key-values` flag below)
- ~$80–$300/month budget depending on how often the VM is running

## Step 1 — provision the VM

```bash
# Names + region — change to taste
RG=heirloom-rg
LOCATION=eastus2
VM=heirloom-vm
DNS_NAME=heirloom-$(openssl rand -hex 3)

az group create --name "$RG" --location "$LOCATION" \
    --tags project=heirloom

az vm create \
    --resource-group "$RG" \
    --name "$VM" \
    --image Ubuntu2204 \
    --size Standard_D8as_v5 \
    --admin-username heirloom \
    --ssh-key-values ~/.ssh/id_rsa.pub \
    --public-ip-sku Standard \
    --public-ip-address-allocation Static \
    --public-ip-address-dns-name "$DNS_NAME" \
    --os-disk-size-gb 64 \
    --storage-sku Premium_LRS \
    --tags project=heirloom

# Open HTTP + HTTPS (SSH is open by default)
az vm open-port -g "$RG" -n "$VM" --port 80  --priority 900
az vm open-port -g "$RG" -n "$VM" --port 443 --priority 901

# Note the public IP + hostname that come back from the create command —
# the hostname is what visitors use.
```

You should get back something like
`heirloom-1ab066.eastus2.cloudapp.azure.com`. That's the URL your loved
one or your judge types into Safari. Caddy will provision a valid
Let's Encrypt cert for it on first boot.

## Step 2 — install the stack (run on the VM)

The `infra/vm-setup.sh` script in this repo does the whole bootstrap.
Copy it up and run it. The `PUBLIC_HOST` environment variable tells
Caddy which hostname to issue a TLS certificate for.

```bash
scp infra/vm-setup.sh heirloom@<vm-ip>:/tmp/

ssh heirloom@<vm-ip> "sudo PUBLIC_HOST=$DNS_NAME.eastus2.cloudapp.azure.com bash /tmp/vm-setup.sh"
```

What it does, in order:

1. `apt-get install` of base packages (build tools, ffmpeg, openssl,
   gnupg, …)
2. Node 22 + pnpm 10
3. PostgreSQL 16 + pgvector from the official apt.postgresql.org repo
4. Postgres role `heirloom_app` with a randomly generated password
5. Ollama (CPU-only systemd unit; no GPU drivers needed)
6. `ollama pull gemma4:e4b` (9.6 GB — this is the long step)
7. `ollama pull embeddinggemma` (621 MB)
8. whisper-cpp built from source with `small.en` weights
9. A dedicated `heirloom` system user with `/opt/heirloom/app` for the
   source and `/opt/heirloom/.env` for secrets (JWT_SECRET, DB password,
   PUBLIC host)
10. A `heirloom.service` systemd unit (registered but not yet started —
    it's waiting on your source to land)
11. Caddy with automatic TLS at the PUBLIC_HOST you set

Expect ~15–20 minutes total. Most of it is waiting on the gemma4:e4b
download.

## Step 3 — ship the source

From your local clone of the Heirloom repo:

```bash
rsync -az --delete \
    --exclude='node_modules/' \
    --exclude='.next/' \
    --exclude='.git/' \
    --exclude='storage/blobs/' \
    --exclude='storage/whisper-models/' \
    --exclude='.tmp-screenshots/' \
    --exclude='.env.local' \
    ./ heirloom@<vm-ip>:/opt/heirloom/app/
```

This is ~30 MB of source + the bundled face-api.js model weights
(~6.7 MB in `public/models/`).

## Step 4 — build + start

```bash
scp infra/build-and-start.sh heirloom@<vm-ip>:/tmp/
ssh heirloom@<vm-ip> \
    'sudo cp /tmp/build-and-start.sh /opt/heirloom/build-and-start.sh && \
     sudo chmod +x /opt/heirloom/build-and-start.sh && \
     sudo bash /opt/heirloom/build-and-start.sh'
```

This:

1. Chowns the source to the `heirloom` user
2. Runs `pnpm install` + `pnpm build` against the env in
   `/opt/heirloom/.env`
3. Applies `design-system/handoff/SCHEMA.sql` + every
   `migrations/*.sql` (idempotent — safe to re-run)
4. Builds `heirloom/gemma4-grounded` locally from the bundled
   `Modelfile`
5. `systemctl restart heirloom` — the unit starts the production
   server, Caddy starts proxying TLS traffic to it

Total: ~4 minutes for pnpm install + Next.js production build.

When it's done you'll see:

```
ok  Heirloom up — Caddy now serves https traffic
Reachable at:
  https://heirloom-xxxxxx.eastus2.cloudapp.azure.com
```

That URL is now live. Open it in a browser — the portal renders, "Begin
a new archive" walks you through onboarding, audio recording works
because we have a valid TLS cert.

## Operational commands

```bash
# Tail the Heirloom app log
ssh heirloom@<vm-ip> 'sudo journalctl -u heirloom -f'

# Tail Ollama
ssh heirloom@<vm-ip> 'sudo journalctl -u ollama -f'

# Restart after a source rsync (re-runs build + restart)
ssh heirloom@<vm-ip> 'sudo bash /opt/heirloom/build-and-start.sh'

# Restart only the app (no rebuild)
ssh heirloom@<vm-ip> 'sudo systemctl restart heirloom'

# Pause the VM to stop hourly charges (storage still bills ~$10/mo)
az vm deallocate -g heirloom-rg -n heirloom-vm

# Resume
az vm start -g heirloom-rg -n heirloom-vm

# Tear it all down
az group delete -g heirloom-rg --yes --no-wait
```

## CPU vs. GPU — what to expect

This is the single most important section of this document. **Run the
demo locally if you can.** A Mac with Gemma 4 e4b on Apple Silicon GPU
runs Reflection in 3–5 s. The same model on 8 CPU cores takes 30–60 s.
That's a ~15× gap. For a hackathon demo video, recording on local
hardware is the right call. The cloud URL is for judges or family
members who can't install Ollama themselves; it is not the
fastest-feels-best surface.

Measured numbers on the actual production deploy (D8as_v5, 8 vCPU AMD,
no GPU) after the perf work in `18f9227`:

| Surface | M4 Pro local | D8as_v5 cloud |
|---|---|---|
| Greeting on home (cached) | ~50 ms | ~80 ms |
| Note save → "Saved" | <2 s | ~1–2 s (status flips ready before Gemma) |
| Tag + auto-title (background) | ~2–4 s | ~15–25 s (off the user-perceived path) |
| Photo caption via Gemma 4 vision | ~1.7 s | ~30–90 s |
| Whisper small.en (30 s clip) | ~3 s | ~6 s |
| EmbeddingGemma per chunk | ~50 ms | ~200 ms |
| Reflection — empty state (no Gemma call) | ~200 ms | ~200 ms |
| Reflection — time to first streamed token | ~3 s | ~27 s |
| Reflection — full answer (~3 claims) | ~5 s | ~60 s |

The CPU bottleneck is **prompt evaluation**, not generation. Gemma 4
e4b processes ~80 tokens/sec of input on 8 vCPUs; we ship the top-5
retrieved chunks plus the system prompt, around 2,000 input tokens,
which dominates the wait. The actual streaming after that is a steady
~3–4 tok/s — about the speed of fast typing.

What we did to make CPU feel less painful:

- **Stream the partial answer**. `/api/reflect` emits an
  `answer_partial` SSE event each time Gemma extends the prose, so the
  user sees words forming rather than a 30-second whitespace stare.
- **Reorder the note pipeline**. Capture goes to `status='ready'`
  before tagging + auto-title. The user sees "Saved" in 1–2 s; tags
  appear on the next home load.
- **Async prompt-of-day on home**. The home renders instantly; the
  Gemma-generated prompt fetches in the background.
- **`OLLAMA_NUM_PARALLEL=2`** + **`OLLAMA_KEEP_ALIVE=30m`** so the
  model stays resident and tag+title can overlap.
- **Pre-warm at boot**. A separate `ollama-warmup.service` systemd
  unit fires one tiny inference + one embed right after Ollama
  starts, so the first real user request doesn't pay the ~10–15 s
  cold-load tax.
- **Cut retrieval from top-8 to top-5**. ~25% less prompt to evaluate.

It's still slow. There's a floor on CPU and we're near it.

If you have GPU quota, swap to an NCv4 (Tesla T4) — the deploy scripts
are unchanged because Ollama auto-detects CUDA. Add the NVIDIA driver
+ CUDA runtime install before the Ollama install step. Expect numbers
to land between the M4 Pro and the CPU columns above.

## Known issues with the Turbopack production build

During this project's first cloud deploy we ran into a reproducible bug
where Turbopack on the VM silently dead-code-eliminated a code branch
in `src/app/api/reflect/route.ts` — specifically the `answer_partial`
streaming logic. The same build on the developer laptop produced the
correct output. Both machines run Node 22 and Next.js 16.2.6 with the
bundled Turbopack.

**Workaround**: build `.next` locally and rsync the output to the VM
instead of running `pnpm build` there.

```bash
# On your laptop
pnpm install
pnpm build

# Ship the compiled output directly
rsync -az --delete .next/ \
    heirloom@<vm-ip>:/opt/heirloom/app/.next/
ssh heirloom@<vm-ip> 'sudo chown -R heirloom:heirloom /opt/heirloom/app/.next \
    && sudo systemctl restart heirloom'
```

The systemd `heirloom.service` unit invokes `pnpm start`, which only
needs the `.next` directory and `node_modules`. Skipping the on-VM
build sidesteps the Turbopack quirk entirely.

When this is fixed upstream, the `build-and-start.sh` script's
`pnpm build` step will once again be reliable. Until then, prefer
the local-build-then-rsync pattern for production deploys.

## Updating later

The reliable pattern is local build + ship the artifact, not on-VM
build:

```bash
# From your local clone
pnpm build

rsync -az --exclude=node_modules/ --exclude=storage/ \
    --exclude=.tmp-screenshots/ ./ \
    heirloom@<vm-ip>:/opt/heirloom/app/

# Run migrations + restart (re-uses the .next we just rsynced; the
# pnpm build inside build-and-start.sh becomes a no-op if .next is
# already current, or you can edit the script to skip it entirely).
ssh heirloom@<vm-ip> 'sudo bash /opt/heirloom/build-and-start.sh'
```

Migrations are idempotent. If you only changed code and not schema,
just rsync `.next/` and restart:

```bash
pnpm build
rsync -az --delete .next/ \
    heirloom@<vm-ip>:/opt/heirloom/app/.next/
ssh heirloom@<vm-ip> 'sudo chown -R heirloom:heirloom /opt/heirloom/app/.next \
    && sudo systemctl restart heirloom'
```

## Backups

Everything that matters lives in two places on the VM:

1. PostgreSQL `heirloom` database — captures, transcripts, chunks, tags,
   embeddings, sealed letters, nominees, reflections.
2. `/opt/heirloom/app/storage/blobs/` — the audio/photo/video original
   bytes.

A nightly cron that does:

```bash
pg_dump heirloom | zstd > /opt/backups/heirloom-$(date +%F).sql.zst
tar -C /opt/heirloom/app -czf /opt/backups/blobs-$(date +%F).tar.gz storage/blobs
```

…and rsyncs `/opt/backups/` to S3 (or a local NAS, or a USB drive in
your house, or anywhere you trust) is enough.

Even better: use the in-app `.hloom` export
(`POST /api/vault/export` with a passphrase) to capture the entire vault
as a single encrypted file you can drop in any storage. That bundle is
provider-independent — it imports cleanly into a fresh Heirloom
instance running anywhere.

## When the cloud isn't the right answer

If any of these are true, run locally instead:

- The archive holds material you're not comfortable having on shared
  cloud hardware (highly sensitive medical, legal, intimate)
- The recipient is technical enough to install Heirloom themselves
- You haven't yet decided what's in the archive — drafts shouldn't
  cross the network until they're ready

For those cases, ship the recipient a `.hloom` file via the in-app
export instead and let them import it into their own local instance.
That keeps every byte under exactly two pairs of eyes: yours and theirs.

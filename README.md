# Heirloom

> Preserve presence across generations.

Heirloom is a private, local-first memory archive. A creator (Elena) records
stories, photographs, voice memories, and sealed letters across her life.
A nominee (Maya) receives the archive at the right moment - sometimes a date,
sometimes a state of mind - and asks it grounded questions for the rest of
hers. The model never speaks AS Elena; it cites what she actually said.

Everything runs on the creator's machine: Gemma 4 e4b via Ollama for
synthesis and vision, EmbeddingGemma for retrieval, Whisper for audio,
Postgres + pgvector for the index, face-api.js in the browser for face
clustering. No telemetry. No cloud.

## What's in here

A laundry list, plainly stated. Every one of these works offline, on a
laptop, with no external API.

### Capture

- **Notes** with auto-generated titles. Gemma 4 reads the body once it
  is saved and proposes a calm headline; the creator can override it.
- **Voice notes** transcribed by `whisper-cpp small.en`, segment-aligned,
  chunked, and embedded into pgvector for retrieval.
- **Photos** captioned by Gemma 4 vision. Captions are written in the
  archival third person and name the people in the frame (see *Identity
  awareness* below).
- **Pipeline-stage feedback.** Capture sheets stream
  `embedding → tagging → titling → ready` events over SSE so the user
  sees what the model is doing without waiting on a spinner.
- **Tag clustering.** Each capture is tagged across four facets - emotion,
  topic, person, place - which drives the "Themes" cards on the home.
- **Drafts persist locally.** If the network drops or the page refreshes
  mid-capture, IndexedDB holds the blob until the next save attempt.

### Identity awareness

- **Face detection runs in the browser** via `face-api.js`. 128-d
  descriptors never leave the device unencrypted.
- **Self-person + nominee photos** can be set at onboarding or later
  from Settings → Your photo / Settings → Nominees. Photo can come from
  the camera or the photo library.
- **Identity-aware captions.** When face recognition matches a known
  person in a new photo, the vision prompt is rewritten so the caption
  starts with their name ("Anisha holding a cup of coffee" instead of
  "a young woman in a dark top").
- **Strict match threshold.** Cosine similarity must clear `0.90`
  before a face is linked to a known person. Look-alikes in the same
  demographic typically land at 0.5–0.7 and stay unlabeled. If a
  threshold change retroactively drops a link, the matching photo's
  caption is re-rendered without the wrong name.

### Voice

- **Voice cloning, offline.** LuxTTS (a ZipVoice flow-matching model)
  runs as a local FastAPI sidecar on `127.0.0.1:11435`. The creator
  records ~15 seconds of natural speech once; text-only captures can
  be played back in their cloned voice on demand.
- **Original-recording playback.** For voice notes, the player streams
  the creator's actual recording rather than synthesizing a clone of
  their own audio. The cloned voice is reserved for notes, photo
  captions, and other text-only sources where no original recording
  exists.
- **Verbatim contract.** When TTS does speak, it only speaks text that
  exists in the archive: a capture body, a transcript line, the
  verbatim snippet behind a Reflection citation. There is no free-text
  "speak this" affordance.
- **Stable timbre.** The flow-matching seed is fixed per voice, not
  per utterance. Every sentence starts from the same noise vector so
  the same voice sounds the same across notes, citations, and lines
  of varying length. Synthesised lines are cached on disk keyed by
  `(voice_id, text)`.
- **Calm prosody.** A small punctuation sanitiser softens dramatic
  emphasis (`!` to `.`, ellipses normalised, ALL-CAPS softened) before
  the model sees the text.
- **Adaptive prompt window.** Encoded prompts use up to 15 seconds of
  the reference (LuxTTS's recommended ceiling); recordings shorter
  than 10 seconds are rejected so users don't end up with a
  degenerate clone.

### Grounded reflection

- **Whole-capture indexing.** Every textual field on a capture (title,
  body, photo caption, audio transcript) is concatenated, sentence
  chunked, embedded, and written to the vector index. A note titled
  "Wedding planning" is retrievable by its title even when the body
  doesn't repeat the word.
- **Self-healing index.** Reflect calls a one-shot backfill before
  retrieval. If a capture is `ready` but its chunks are missing or
  pre-date a field that should now be indexed, it re-embeds before
  searching. Idempotent and a no-op on a healthy vault.
- **Retrieval before model.** Every question is embedded
  (`EmbeddingGemma`, 768-d) and matched against the archive's pgvector
  HNSW index. If the top chunk falls below cosine `0.40`, the empty
  state is served verbatim and the language model is never invoked.
- **Citation validator.** Every claim in a streamed answer is checked
  against the retrieved set. A claim citing a chunk outside that set
  rejects the entire answer.
- **First-person scrubber.** Any answer using "I" or "my" outside
  quoted text rejects the entire answer.
- **Photo answers.** When a citation points at a photo capture, the
  reflect UI renders a thumbnail grid and shows the full image inside
  the citation drawer instead of a text-only pill chip.
- **Transparency log.** Every Reflection's diagnostics - retrieved
  chunks, similarities, rejection reason - are persisted and viewable
  at `/transparency`.

### Sealed letters and conditional unlock

- **Letters that wait.** A creator can write a letter "for when Maya
  feels lost" or "for the morning after her wedding". Each letter
  embeds an intent vector + a structured condition.
- **Five trigger kinds:** absolute date, life event (anniversary,
  birthday, etc.), mood ("scared", "proud", typed into the home),
  semantic match against a Reflection question, and first-visit.
- **Daily cron.** A schedule worker fires on the host's cron at 09:00
  local; date- and life-event triggered letters release that morning.
- **Soft inserts.** Releases happen through `nominee_releases` rows so
  the existing RLS policies surface the underlying capture naturally,
  with no separate "is this letter unlocked" check downstream.

### Daily prompts

- **Living prompts.** Each app open shows a fresh writing prompt
  generated against the creator's identity index (their name, life
  anchors, nominees). The prompts are calm and specific:
  *"A moment when you felt small but watched, and chose to act anyway."*
- **Identity index.** A hidden `is_profile=true` capture stores the
  creator's structured biography (name, nominees, sealed letters in
  flight) and is included in retrieval so prompts and answers always
  have continuity.

### Notifications

- **Web Push.** VAPID-signed push subscriptions work on iOS Safari
  PWAs (after Add-to-Home-Screen). Nominees can opt in from Settings,
  test delivery in a click, and the server self-heals stale
  subscriptions on the next test.
- **Anniversary nudges.** The daily cron also queues push deliveries
  when a date-triggered release fires, so a nominee learns "there is
  a letter for today" the moment it unlocks.
- **Manual trigger.** `POST /api/dev/send-memory` fires a release to
  a given nominee on demand, useful for verifying notification setup.

### Nominee surface

- **A different home.** A nominee never sees the capture composer.
  Their home is a daily memory hero, a recent timeline, themed
  albums, and a Reflect search box.
- **Daily memory hero.** When a release fires today, the full body
  renders inline with the photo (if any) and a "Hear it in their
  voice" button. Tapping the photo opens a fullscreen lightbox.
- **Released-only retrieval.** All Reflection queries from the
  nominee surface are RLS-gated to released captures; nothing the
  creator drafted but never released is reachable, even by prompt
  injection.

### Encrypted vault export

- **One file, self-contained.** A creator can export the entire
  archive - captures, transcripts, embeddings, people, face links,
  voice profile (with reference audio), nominees, sealed letters,
  release schedule, life events - as a single passphrase-encrypted
  `.hloom` file. Embeddings round-trip through a backend-agnostic
  `number[]` form so Postgres bundles import cleanly into SQLite and
  vice versa.
- **argon2id + ChaCha20-Poly1305.** Key derivation tuned to
  m=64 MiB, t=3, p=4. The bundle is self-describing (magic header
  `HLOOM`, version 2, KDF params, nonce, ciphertext, tag). v1
  bundles still decrypt for forward compatibility.
- **Import is symmetric.** The recipient runs Heirloom on their own
  device. The entry portal exposes "Import an existing archive"
  directly - choose the `.hloom`, enter its passphrase, and a fresh
  creator is minted with a new local key. From that moment the archive
  lives on their own hardware. No server ever sees the data decrypted.

### Privacy posture

- **Local-first by default.** The canonical install is `./install.sh`
  on the creator's own Mac.
- **No telemetry.** The only outbound HTTPS the running app makes is
  Caddy → Let's Encrypt for cert renewal (self-host only) and Ollama
  → ollama.com on the first model pull. Everything else stays on the
  box.
- **No managed inference.** The product is Gemma 4 + LuxTTS + Whisper
  running locally. There is no fallback to OpenAI, Together, Replicate,
  or any third-party model host. Ever.
- **Row-level security at the DB.** Every API request opens a Postgres
  transaction with `app.user_id` and `app.role` set, and every table
  has policies that scope reads/writes per role.

### Operations

- **PWA.** Installable from iOS Safari and Android Chrome; manifest +
  apple-touch-icon + optional service worker in production.
- **Standalone Next build.** `pnpm build` outputs `.next/standalone`,
  pin `HEIRLOOM_BLOB_DIR` to keep uploaded media outside the build
  output, run with `node .next/standalone/server.js`.
- **Dev console.** `/dev` is a role-switcher console for testing the
  nominee + executor surfaces side-by-side without re-onboarding.
- **Vault reset.** `POST /api/dev/reset` wipes captures, embeddings,
  releases, and people while preserving the creator's identity row.

## Try it locally

One-command install on macOS (Apple Silicon recommended, 48 GB unified
memory ideal):

```bash
curl -fsSL https://heirloom.app/install.sh | bash
```

Or clone + run the bundled script:

```bash
git clone https://github.com/yourname/heirloom
cd heirloom
./install.sh
pnpm dev
```

That installs Homebrew (if needed), Ollama, whisper-cpp, ffmpeg,
PostgreSQL 16 + pgvector, pnpm, applies migrations, writes `.env.local`,
and pulls `gemma4:e4b` (9.6 GB) and `embeddinggemma` (621 MB). First-run
total is ~15 minutes on a decent connection.

Open `http://localhost:3000`. The first visit walks the creator through a
four-step welcome (name + selfie → life anchors → nominees → seed letters);
subsequent visits land on the creator home. `/dev` is the role-switcher
console for testing the nominee + executor surfaces side-by-side.

### Coming back to an archive

"Begin a new archive" mints a fresh creator and shows a four-word
passphrase once. Write it down. After signing out, the portal's
"I have a passphrase" door re-opens that same archive on the same
device, without an email or password. Each "Begin a new archive" call
creates an independent vault, so a single host can carry several side
by side. The same portal also exposes "Import an existing archive" -
hand it a `.hloom` bundle + its passphrase and it mints a fresh
creator that's pre-populated with the bundle's content, hands back a
new local key, and signs you in.

### Mac app (DMG)

The `desktop/` workspace builds a Tauri `.app` that ships its own
Node server, Ollama-pulled gemma4 weights, and a whisper.cpp binary
with `ggml-base.en` baked in. Build it with:

```bash
pnpm install
bash desktop/scripts/package.sh
```

Output lands at
`desktop/src-tauri/target/release/bundle/dmg/Heirloom.dmg` (~210 MB).
The shell picks an ephemeral port at startup so it never collides
with a developer's dev server on `:3000`. Voice-cloning is opt-in:
run `Contents/Resources/tts/install-tts.sh` once to drop a Python
venv with LuxTTS at `~/Library/Application Support/Heirloom/tts/`,
which the shell auto-spawns on next launch.

## Self-host on a cloud VM (optional)

Local is the recommended path. The cloud option exists for the specific
case where a non-technical loved one needs to receive the archive and
can't run Ollama themselves - they visit one URL on their phone or
laptop and the archive is right there.

Same code, same architecture, just on a VM you control. Nothing about
the product changes; only where the binaries run.

```bash
# Provision an Azure VM (no GPU required - single-VM, all-on-one)
RG=heirloom-rg LOCATION=eastus2 VM=heirloom-vm
DNS_NAME=heirloom-$(openssl rand -hex 3)

az group create -n "$RG" -l "$LOCATION"
az vm create -g "$RG" -n "$VM" \
    --image Ubuntu2204 --size Standard_D8as_v5 \
    --admin-username heirloom --ssh-key-values ~/.ssh/id_rsa.pub \
    --public-ip-sku Standard --public-ip-address-allocation Static \
    --public-ip-address-dns-name "$DNS_NAME" \
    --os-disk-size-gb 64 --storage-sku Premium_LRS
az vm open-port -g "$RG" -n "$VM" --port 80  --priority 900
az vm open-port -g "$RG" -n "$VM" --port 443 --priority 901

# Bootstrap the stack on the VM (installs Ollama, Postgres, Whisper,
# Caddy w/ Let's Encrypt; pulls gemma4:e4b ~9.6 GB)
scp infra/vm-setup.sh heirloom@<vm-ip>:/tmp/
ssh heirloom@<vm-ip> \
    "sudo PUBLIC_HOST=$DNS_NAME.eastus2.cloudapp.azure.com bash /tmp/vm-setup.sh"

# Ship the source and build
rsync -az --exclude=node_modules/ --exclude=.next/ \
    --exclude=storage/ --exclude=.tmp-screenshots/ \
    ./ heirloom@<vm-ip>:/opt/heirloom/app/
scp infra/build-and-start.sh heirloom@<vm-ip>:/tmp/
ssh heirloom@<vm-ip> 'sudo bash /tmp/build-and-start.sh'
```

The full runbook - provider alternatives (Hetzner, Mac mini at home),
operational commands, backup recipe, CPU-vs-GPU expectations - lives in
[`docs/DEPLOY-AZURE-VM.md`](./docs/DEPLOY-AZURE-VM.md).

**Things to know if you self-host:**

- v1 is **single-creator per VM**. The first person through onboarding
  becomes the creator; concurrent visitors see each other's data. Share
  the URL only with the recipient you intend until per-user signup
  lands.
- CPU inference is **slow**. A Reflection answer that streams in
  seconds on a GPU laptop can take 30–90 s on a CPU-only VM.
  Acceptable for a small audience; not acceptable for a public launch.
- **Nothing phones home.** The only outbound HTTPS the running app
  makes is Caddy → Let's Encrypt for certificate renewal, and Ollama →
  ollama.com on the first model pull. Everything else stays on the box.
- **You are the admin.** SSH access = full access to every recording
  and transcript. Treat keys accordingly.
- **For the most private multi-device path, use the `.hloom` export
  instead.** `POST /api/vault/export` produces a single passphrase-
  encrypted file (argon2id + ChaCha20-Poly1305) that imports into a
  recipient's own local Heirloom. The data never touches a third party
  decrypted.

## Architecture

```
        ┌──────────────────────────┐
        │  Creator / nominee PWA   │
        │  Next.js 16, RSC, Tailwind v4
        │  face-api.js (client)    │
        └────────────┬─────────────┘
                     │ HTTPS
        ┌────────────▼─────────────┐
        │ Next.js API routes       │
        │  - /api/capture          │
        │  - /api/reflect (SSE)    │
        │  - /api/nominee/mood     │
        │  - /api/vault/export     │
        │  - /api/transparency     │
        └─┬──────────┬──────────┬──┘
          │          │          │
   ┌──────▼──┐ ┌─────▼────┐ ┌───▼────────┐
   │ Ollama  │ │ whisper- │ │ Postgres   │
   │  :11434 │ │ cli      │ │  + pgvector│
   │         │ │          │ │            │
   │ gemma4  │ │ small.en │ │ HNSW index │
   │ embed-  │ │          │ │ RLS gates  │
   │ gemma   │ │          │ │            │
   └─────────┘ └──────────┘ └────────────┘
```

The grounding contract is hard-coded:

1. **Retrieval before model.** Every question is embedded and matched
   against the archive's pgvector index. If the top chunk falls below
   cosine `0.40`, the empty state is served verbatim and the language
   model is never invoked.
2. **Citation validator.** Every claim in a streamed Reflection answer is
   checked against the retrieved set. A claim citing a chunk outside that
   set rejects the entire answer.
3. **First-person scrubber.** Any answer using "I" or "my" outside quoted
   text rejects the entire answer.
4. **Verbatim empty state.** When any check fails the response collapses
   to: *"I don't have that in the archive. Try asking another way?"*

Every Reflection query's diagnostics are persisted and visible at
`/transparency` - you can see exactly how each decision was made,
including the retrieved chunks and their similarity scores.

## Sealed letters with conditional unlock

A creator writes a letter "for when Maya feels lost" during onboarding.
The letter's intent prompt is embedded (`EmbeddingGemma`, 768-dim). It
stays sealed until one of these triggers fires:

| Condition | Mechanism |
|---|---|
| `date` | Daily cron checks `today >= conditions.date` |
| `life_event` | Subject reaches the event (engagement, birthday, etc.) |
| `state` | Nominee taps a mood chip on the home - embeds, semantic-matches the letter intent |
| `semantic_match` | Nominee asks Reflection a question whose embedding sits within `0.55` of the letter's intent |
| `first_visit` | First nominee home load after the letter was sealed |

Each trigger inserts a `nominee_releases` row, so the existing
row-level-security policies surface the underlying capture naturally -
no separate "is this letter unlocked" check needed downstream.

## Encrypted vault export

A creator can export their entire vault - audio blobs, transcripts,
embeddings, life events, sealed letters - as a single passphrase-encrypted
`.hloom` file. The recipient runs Heirloom on their own machine, imports
the bundle, and from that moment the archive lives on their own hardware.

Encryption: **argon2id** key derivation (m=64 MiB, t=3, p=4) →
**ChaCha20-Poly1305** AEAD over a gzipped JSON envelope. The bundle is
self-describing - magic header `HLOOM`, version `1`, KDF params, nonce,
ciphertext, tag.

```bash
# Export
curl -X POST http://localhost:3000/api/vault/export \
  -d '{"passphrase":"<the passphrase>"}' -o my-vault.hloom

# Import (into a fresh Heirloom instance)
curl -X POST http://localhost:3000/api/vault/import \
  -F file=@my-vault.hloom \
  -F passphrase="<the passphrase>"
```

## Multi-modal Gemma 4 via Ollama

Heirloom uses Gemma 4 across three modalities:

- **Text synthesis** for Reflection answers, letter prompts, note titles,
  and capture tagging - `gemma4:e4b` via `/api/chat`.
- **Vision captioning** for photo uploads - same model, same endpoint,
  `images: [b64]` field. When the on-device face recognizer
  (face-api.js, 128-d descriptors) clusters a face to a known person,
  the system prompt names them so the caption reads "Elena holding
  Maya at the kitchen window" rather than "a woman holding a child".
- **Embeddings** - `embeddinggemma` (300M params, 768-dim, 621 MB) for
  the shared text + caption vector space.

The custom `heirloom/gemma4-grounded` Modelfile bakes the grounding
contract into the system prompt; create it locally with
`ollama create heirloom/gemma4-grounded -f Modelfile`.

Audio understanding via Gemma 4 directly is upstream-blocked
([ollama/ollama#11798](https://github.com/ollama/ollama/issues/11798) - the
audio projector isn't published yet). Heirloom transcribes through
`whisper-cpp small.en` until then. See
[`docs/MULTIMODAL-ECOSYSTEM.md`](./docs/MULTIMODAL-ECOSYSTEM.md) for the
full analysis and the proposed bridge.

## Tech stack

- **Frontend** - Next.js 16 (App Router, RSC, Turbopack), Tailwind v4
  with custom `@theme static` tokens (warm-paper palette), Framer Motion,
  Source Serif 4 + Geist + JetBrains Mono.
- **Backend** - Next.js route handlers, postgres.js for SQL with
  per-request `withRls()` wrapping every transaction, argon2 for
  passphrases (executor + per-nominee), jose for JWT cookies.
- **AI runtime** - Ollama for everything supported, whisper-cpp for
  audio, face-api.js in the browser for face descriptors.
- **Database** - PostgreSQL 16 + pgvector, HNSW indexes on every 128 / 768
  dim vector column, RLS policies per-role (creator full read/write,
  nominee restricted to released captures only).
- **PWA** - manifest + apple-touch-icon, optional service worker in
  production, installable from iOS Safari "Add to Home Screen".

## Why local-first

The product is about presence. The data is voice recordings of someone's
mother, photographs of their childhood, things they would say to their
children if they had the words. None of that should pass through a
third-party server.

Local-first also means the archive survives when the company doesn't. The
`.hloom` bundle is yours, encrypted with a passphrase only you know. Even
if Heirloom the project disappears tomorrow, the bundle and the open-source
code remain.

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) - product philosophy + engineering principles
- [`design-system/`](./design-system/) - design tokens, prototypes, handoff
  package (architecture, API contracts, schema, prompts, guardrails)
- [`docs/MULTIMODAL-ECOSYSTEM.md`](./docs/MULTIMODAL-ECOSYSTEM.md) - Gemma 4
  multimodal notes
- [`docs/DEPLOY-AZURE-VM.md`](./docs/DEPLOY-AZURE-VM.md) - self-hosted VM runbook

## License

Apache 2.0. Gemma 4 weights ship under their own Apache 2.0 license; the
Heirloom code is under the same. See [`LICENSE`](./LICENSE) (TBD before
public launch).

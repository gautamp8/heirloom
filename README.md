<div align="center">
  <img src="public/seal-2x.png" width="120" alt="Heirloom wax seal">

# Heirloom

*Preserve presence across generations.*

</div>

---

Heirloom holds what someone wanted to leave behind. Voice, photographs,
letters, the things a person actually said, kept in a private archive
that the people they love can come back to in their own time.

It is not a chatbot. It is not a resurrection. The system never speaks
*as* anyone. It points back to what was actually said, in the voice
that actually said it, and stays quiet when it has nothing real to
point to. Everything runs on the creator's own machine. Nothing leaves
it.

## Contents

- [What this is, and what it isn't](#what-this-is-and-what-it-isnt)
- [A walk through the archive](#a-walk-through-the-archive)
- [Features](#features)
- [The grounding contract](#the-grounding-contract)
- [Run it locally](#run-it-locally)
- [Architecture](#architecture)
- [Ethics + design](#ethics--design-choices)
- [License](#license)

---

## What this is, and what it isn't

Heirloom is a memory archive for people who want to leave something
specific behind for someone specific. A grandparent recording stories
for a grandchild they may not get to meet. A parent writing letters
for moments that haven't arrived yet. A partner setting aside the
quiet sentences they wish they'd said out loud more often.

The creator makes the archive while they are alive and well. They
decide what goes in and who it is for. The recipient - a *nominee*
- receives access on the creator's terms, at the moment the creator
chose, in the rooms of their own house, on hardware they own.

### What this is not

- **Not a chatbot pretending to be a person.** The synthesis model
  is never given license to speak as the creator. Every answer is
  grounded in something the creator actually wrote, said, or
  photographed; uncited claims and first-person impersonation fail
  closed to a verbatim *"I don't have that in the archive"* response.
- **Not a digital resurrection.** Voice cloning is opt-in, recorded
  by a living creator, and only ever speaks text the creator already
  wrote. There is no free-form "speak this for me" affordance.
- **Not a grief loop.** No streaks, no engagement notifications, no
  *"Sam, you haven't visited in 14 days."* The archive is available;
  it never asks. People should come back when they want to, not
  because an app pulled them in.
- **Not stored in a cloud.** No telemetry, no managed inference, no
  third-party model providers. Heirloom installs on the creator's own
  laptop or a Mac mini the family owns; everything stays there.

The fuller treatment of these choices, and what we refused to build
along the way, lives in [`docs/ETHICS-AND-DESIGN.md`](./docs/ETHICS-AND-DESIGN.md).

---

## A walk through the archive

### Begin or come back

<img src="docs/screenshots/01-portal.png" width="100%" alt="Portal page with three doors: Begin a new archive, I have a passphrase, Import an existing archive">

Three doors. Begin a new archive mints a fresh creator and shows a
four-word passphrase, written down once. *I have a passphrase*
re-opens an archive on the same device after signing out. *Import an
existing archive* takes a `.hloom` bundle handed off from someone
else and unlocks it locally.

### The creator's home

<img src="docs/screenshots/02-creator-home.png" width="100%" alt="Creator home showing greeting, daily prompt, capture chips, and a recent feed of saved notes">

A daily prompt generated against the creator's identity index, four
capture surfaces (voice, note, photo, video), a single line to ask
the archive a question, and a recent feed. No streaks. No counts that
shame. No nudges.

### Capture

A note is a paragraph. A voice memo is a take, transcribed by
Whisper, chunked and embedded for retrieval, original audio
preserved for playback. A photo is captioned by Gemma 4 vision in
the archival third person; if a face matches someone the creator
has named, the caption uses that name.

### Reflect

<img src="docs/screenshots/03-reflect-citation.png" width="100%" alt="Reflect view: a synthesized answer above a citation chip; tapping the chip slides up a source drawer with the original capture text and a Hear in their voice button">

A question is embedded, matched against the vault's vector index,
and the language model is only allowed to speak when retrieval has
found something to point at. Every answer carries citation chips
that open the source verbatim - and, where the source was a voice
recording, play it back in the creator's actual voice.

### The nominee's home

<img src="docs/screenshots/04-nominee-home.png" width="100%" alt="Nominee home showing a daily memory hero with photograph, mood chips, and a Reflect prompt">

A different surface. No capture composer, no settings the creator
chose to keep private. A daily memory hero pulled from what's been
released, a row of mood chips that can quietly unlock sealed
letters, and the same grounded Reflect.

### Settings

<img src="docs/screenshots/05-settings.png" width="100%" alt="Creator settings showing nominees list, voice profile, vault export, and session controls">

Editable for the creator: name, anchor dates, nominees, voice
profile, your own reference photo, the archive key, notifications,
encrypted vault export and import. Nominees see a smaller version
with notifications and sign-out only.

### Transparency

<img src="docs/screenshots/06-transparency.png" width="100%" alt="Transparency page showing the grounding contract and a log of past Reflection queries with their decisions">

Every Reflection - answered or refused - is logged with its
diagnostics: the chunks retrieved, the similarity scores, the
reason the model spoke or didn't. The grounding gate is something
you can verify, not just believe.

---

## Features

Every one of these works offline, on a laptop, with no external API.

### Capture

- **Notes** with auto-generated titles. Gemma 4 reads the body once
  saved and proposes a calm headline; the creator can override.
- **Voice memos** transcribed by `whisper-cpp small.en`,
  segment-aligned, chunked, embedded into pgvector for retrieval.
- **Photos** captioned by Gemma 4 vision in the archival third
  person. Identity-aware: a known face in the frame is named.
- **Drafts persist locally.** If the network drops mid-capture,
  IndexedDB holds the blob until the next save attempt.

### Identity awareness

- **Face detection runs in the browser** via `face-api.js`. The
  128-dimension descriptors never leave the device unencrypted.
- **Self-person + nominee photos** can be set at onboarding or
  later from Settings. Photo from the camera or the library.
- **Strict match threshold.** Cosine similarity must clear `0.90`
  before a face is linked to a known person. Look-alikes typically
  land at 0.5 to 0.7 and stay unlabeled.
- **Self-healing captions.** When a threshold change retroactively
  drops a face link, the photo's caption is re-rendered without
  the wrong name.

### Voice

- **Voice cloning, offline.** LuxTTS (a ZipVoice flow-matching
  model) runs as a local FastAPI sidecar on `127.0.0.1:11435`. The
  creator records ~15 seconds of natural speech once.
- **Original-recording playback.** For voice memos, the player
  streams the creator's actual recording. The cloned voice is
  reserved for text-only sources where no original exists.
- **Verbatim contract.** TTS only speaks text that exists in the
  archive: a capture body, a transcript line, the snippet behind a
  Reflection citation. There is no free-text *speak this* surface.
- **Stable timbre.** The flow-matching seed is fixed per voice, not
  per utterance. Synthesised lines are cached on disk keyed by
  `(voice_id, text)`.

### Grounded reflection

- **Whole-capture indexing.** Title, body, photo caption, audio
  transcript - every textual field is concatenated, sentence
  chunked, embedded.
- **Hybrid grounding gate.** A question grounds if its top retrieval
  similarity clears the cosine floor *or* a substantive token of
  the question appears in any retrieved chunk. Empty state
  otherwise, model never invoked.
- **Citation validator.** Every claim in a streamed answer is
  checked against the retrieved set. A claim citing a chunk outside
  that set rejects the entire answer.
- **First-person scrubber.** Any answer using *"I"* or *"my"*
  outside quoted text rejects the entire answer.
- **Photo answers.** Citations on photo captures render the
  thumbnail and open the full image in a source drawer.
- **Transparency log.** Every Reflection's diagnostics -
  retrieved chunks, similarities, rejection reason - are
  persisted at `/transparency`.

### Sealed letters with conditional unlock

A creator writes a letter "for when Sam feels lost" or "for the
morning after Sam's wedding." The letter's intent prompt is embedded
and the body waits for one of five triggers:

| Trigger | Mechanism |
|---|---|
| `date` | Daily cron checks `today >= conditions.date` |
| `life_event` | Anniversary, birthday, milestone reached |
| `state` | Nominee taps a mood chip on their home |
| `semantic_match` | Nominee's Reflection question matches the letter intent |
| `first_visit` | First nominee home load after the letter was sealed |

Each trigger inserts a `nominee_releases` row, so the existing
row-level security policies surface the capture naturally - no
separate *is this letter unlocked* check downstream.

### Encrypted vault export

- **One file, self-contained.** A `.hloom` bundle carries captures,
  transcripts, embeddings, people, face links, voice profile (with
  reference audio), nominees, sealed letters, release schedule,
  life events. Embeddings round-trip across Postgres + pgvector
  and SQLite + sqlite-vec without re-encoding.
- **argon2id + ChaCha20-Poly1305.** KDF tuned m=64 MiB, t=3, p=4.
  Bundle is self-describing: magic header `HLOOM`, version, KDF
  params, nonce, ciphertext, AEAD tag.
- **Import is symmetric.** Hand the file to someone running their
  own Heirloom; the portal's *Import* door mints a fresh creator
  with a new local key and the bundle's content pre-loaded. No
  server ever sees the data decrypted.

### Notifications

- **Web Push.** VAPID-signed subscriptions work on iOS Safari PWAs
  after Add-to-Home-Screen.
- **Anniversary nudges only.** Notifications fire when a release
  unlocks, not on a schedule designed to pull the user back.
  Payload carries only a title - never the content of a memory.
- **Opt-in from Settings.** Default off. Server prunes stale
  subscriptions automatically on the next send.

### Nominee surface

- **A different home.** No capture composer, no creator-only
  settings. Daily memory hero, recent timeline, themed albums,
  Reflect.
- **Released-only retrieval.** Reflection queries are RLS-gated to
  released captures; nothing the creator drafted but never released
  is reachable, even by prompt injection.

### Privacy posture

- **Local-first by default.** Canonical install is `./install.sh`
  on the creator's own Mac, or the signed `.app` bundle.
- **No telemetry.** The only outbound HTTPS the running app makes
  is Ollama → ollama.com on the first model pull, and Caddy → Let's
  Encrypt for cert renewal if you self-host. Everything else stays
  on the box.
- **No managed inference.** The product is Gemma 4 + LuxTTS +
  Whisper running locally. There is no fallback to OpenAI,
  Together, Replicate, or any third-party model host. Ever.
- **Row-level security at the DB.** Every API request opens a
  Postgres transaction with `app.user_id` and `app.role` set, and
  every table has policies that scope reads and writes per role.

---

## The grounding contract

This is the part the careful reader will read carefully.

1. **Retrieval before model.** Every question is embedded
   (`embeddinggemma`, 768-dim) and matched against the archive's
   vector index. The model is not invoked until retrieval has
   produced chunks above the grounding floor.
2. **Hybrid floor.** Grounded if `cosine ≥ 0.30` *or* any retrieved
   chunk literally contains a substantive token of the question.
   Both are necessary for recall; either alone misses too much.
3. **Citation validator.** Every claim in a streamed answer is
   checked against the retrieved set. A claim citing a chunk
   outside that set fails the whole answer.
4. **First-person scrubber.** Any answer using *I* or *my* outside
   quoted material fails the whole answer.
5. **Verbatim empty state.** Failures collapse to: *"I don't have
   that in the archive. Try asking another way?"*

Every Reflection's diagnostics are persisted and visible at
`/transparency`. Nothing about the contract is implicit.

---

## Run it locally

Three supported paths, in order of how local-first each one is.

### macOS app (recommended for non-technical users)

Build the signed `.app` from this repo:

```bash
pnpm install
bash desktop/scripts/package.sh
```

Output lands at
`desktop/src-tauri/target/release/bundle/dmg/Heirloom.dmg` (~210 MB).
The shell ships its own Node server, the Ollama-pulled Gemma 4
weights, and a code-signed whisper.cpp binary with the base English
model baked in. Voice-cloning is opt-in: run
`Contents/Resources/tts/install-tts.sh` once to drop a Python venv
with LuxTTS at `~/Library/Application Support/Heirloom/tts/`.

### macOS dev mode (recommended for contributors)

Apple Silicon recommended; 48 GB unified memory is comfortable.

```bash
git clone https://github.com/gautamp8/heirloom
cd heirloom
./install.sh
pnpm dev
```

`install.sh` installs Homebrew (if needed), Ollama, whisper-cpp,
ffmpeg, PostgreSQL 16 + pgvector, and pnpm; applies migrations;
writes `.env.local`; pulls `gemma4:e4b` (9.6 GB) and
`embeddinggemma` (621 MB). First-run total is ~15 minutes on a
decent connection.

Open `http://localhost:3000`. The first visit walks a creator
through a four-step welcome: name + selfie → life anchors →
nominees → seed letters. Subsequent visits land on the home.

### Self-hosted on any Ubuntu VM (for non-technical recipients)

When someone you love can't run Ollama themselves and you want
them to reach the archive at a URL, the same code runs on a
single Ubuntu 22.04 VM you control. Any provider works: Hetzner,
DigitalOcean, AWS, Azure, a Raspberry Pi at home behind a
Cloudflare Tunnel. The runbook in
[`docs/DEPLOY-AZURE-VM.md`](./docs/DEPLOY-AZURE-VM.md) walks
through one concrete example. Bootstrap is `infra/vm-setup.sh` +
`infra/build-and-start.sh`.

```bash
# 1. Provision an Ubuntu 22.04 VM, ~8 vCPU / 32 GB RAM / 64 GB disk
#    Open ports 22 (SSH) and 443 (HTTPS). Point a DNS A record
#    at the public IP. Add your SSH key to the heirloom user.

# 2. Run the bootstrap on the VM (idempotent, ~10 min):
scp infra/vm-setup.sh heirloom@<host>:/tmp/
ssh heirloom@<host> \
    "sudo PUBLIC_HOST=<your.fqdn> bash /tmp/vm-setup.sh"

# 3. Push code and start the app:
rsync -az --exclude=node_modules/ --exclude=.next/ \
    --exclude=storage/ ./ heirloom@<host>:/opt/heirloom/app/
scp infra/build-and-start.sh heirloom@<host>:/tmp/
ssh heirloom@<host> 'sudo bash /tmp/build-and-start.sh'
```

The scripts install Node 22, pnpm, PostgreSQL 16 + pgvector,
Ollama (CPU mode), whisper-cpp, ffmpeg, and Caddy with automatic
Let's Encrypt certificates. No cloud-specific dependencies; the
only outbound HTTPS the VM ever makes is to ollama.com for the
initial model pull and letsencrypt.org for cert renewal.

Things to know if you go this route:

- **Multiple archives are supported.** Each *Begin a new archive*
  mints an independent creator with its own passphrase and
  RLS-scoped vault. Two creators on one host can't see each
  other's content. Nominees and creators sign in and out via
  their own passphrases.
- CPU inference is **slow**. A Reflection that streams in seconds
  on a GPU laptop can take 30 to 90 seconds on a CPU-only VM.
- **You are the admin.** SSH access equals full access to every
  recording. Treat keys accordingly.
- **The most private multi-device path is the `.hloom` export.**
  `POST /api/vault/export` produces a single passphrase-encrypted
  file that imports into the recipient's own local Heirloom. The
  data never touches a third party decrypted.

Native iOS and Android apps are on the roadmap. They will ship
the model alongside the app so the privacy story still holds
without a server in the loop.

### Coming back to an archive

The four-word passphrase shown at *Begin a new archive* is the
local key. Write it down. The portal's *I have a passphrase* door
re-opens the archive on the same device, scoped to the creator
who owns that passphrase. Each archive on a host is independent -
one install can carry several side by side, isolated by per-row
RLS at the database. The *Import* door takes a `.hloom` and
unlocks it into a fresh local creator account.

### Handing an archive to someone else

When the recipient is also able to run a local Heirloom, the
private path is the `.hloom` bundle. `POST /api/vault/export`
produces a single passphrase-encrypted file (argon2id +
ChaCha20-Poly1305 over a gzipped snapshot of every row and blob).
The recipient drops it into the portal's *Import* door on their
own machine. The data never touches a third party decrypted.

---

## Architecture

<img src="docs/architecture.png" width="100%" alt="Heirloom system architecture — three vertical bands: the PWA / macOS client on the left with face-api.js running on-device, Next.js 16 route handlers in the middle with the /api/reflect endpoint marked in wax red, and the sidecars on the right (Ollama serving gemma4:e4b and embeddinggemma, whisper-cpp, an opt-in LuxTTS / ZipVoice sidecar, Postgres + pgvector or SQLite + sqlite-vec). A footer strip carries the five-step grounding contract and the verbatim refusal sentence.">

The full handoff package - schema, API contracts, prompt set,
guardrails, screen flows - lives in
[`design-system/handoff/`](./design-system/handoff/).

---

## Ethics + design choices

Why we refused to build a chatbot, what the consent ceremony for
voice cloning looks like, why notifications never carry content,
why we picked a wax-seal monogram instead of a sparkle icon, why
the typography is Source Serif and not a system font - written up
in [`docs/ETHICS-AND-DESIGN.md`](./docs/ETHICS-AND-DESIGN.md).

For interface tokens, motion principles, and the copy register,
see [`design-system/DESIGN.md`](./design-system/DESIGN.md).

---

## Documentation

- [`docs/ETHICS-AND-DESIGN.md`](./docs/ETHICS-AND-DESIGN.md) - long-form
  ethics + design rationale
- [`CLAUDE.md`](./CLAUDE.md) - product philosophy + engineering principles
- [`design-system/DESIGN.md`](./design-system/DESIGN.md) - tokens,
  type, motion, voice register
- [`design-system/handoff/`](./design-system/handoff/) - architecture,
  API contracts, schema, prompts, guardrails
- [`docs/DEPLOY-AZURE-VM.md`](./docs/DEPLOY-AZURE-VM.md) -
  self-hosted VM runbook
- [`docs/MULTIMODAL-ECOSYSTEM.md`](./docs/MULTIMODAL-ECOSYSTEM.md) -
  Gemma 4 multimodal notes

---

## License

Apache 2.0. The Gemma 4 weights ship under their own Apache 2.0
license. EmbeddingGemma is licensed under the Gemma terms.
LuxTTS / ZipVoice carries its upstream license; see
`infra/tts-server/` for details.

If Heirloom the project disappears tomorrow, the source code is
yours under Apache 2.0 and any `.hloom` bundle you've exported is
still readable with the open spec in `src/lib/vault-export.ts`.
That property is the point.

# Heirloom

> Preserve presence across generations.

Heirloom is a private, local-first memory archive. A creator (Elena) records
stories, photographs, voice memories, and sealed letters across her life.
A nominee (Maya) receives the archive at the right moment — sometimes a date,
sometimes a state of mind — and asks it grounded questions for the rest of
hers. The model never speaks AS Elena; it cites what she actually said.

Everything runs on the creator's machine: Gemma 4 e4b via Ollama for
synthesis and vision, EmbeddingGemma for retrieval, Whisper for audio,
Postgres + pgvector for the index, face-api.js in the browser for face
clustering. No telemetry. No cloud.

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
`/transparency` — judges (and users) can see exactly how each decision
was made, including the retrieved chunks and their similarity scores.

## Sealed letters with conditional unlock

A creator writes a letter "for when Maya feels lost" during onboarding.
The letter's intent prompt is embedded (`EmbeddingGemma`, 768-dim). It
stays sealed until one of these triggers fires:

| Condition | Mechanism |
|---|---|
| `date` | Daily cron checks `today >= conditions.date` |
| `life_event` | Subject reaches the event (engagement, birthday, etc.) |
| `state` | Nominee taps a mood chip on the home — embeds, semantic-matches the letter intent |
| `semantic_match` | Nominee asks Reflection a question whose embedding sits within `0.55` of the letter's intent |
| `first_visit` | First nominee home load after the letter was sealed |

Each trigger inserts a `nominee_releases` row, so the existing
row-level-security policies surface the underlying capture naturally —
no separate "is this letter unlocked" check needed downstream.

## Encrypted vault export

A creator can export their entire vault — audio blobs, transcripts,
embeddings, life events, sealed letters — as a single passphrase-encrypted
`.hloom` file. The recipient runs Heirloom on their own machine, imports
the bundle, and from that moment the archive lives on their own hardware.

Encryption: **argon2id** key derivation (m=64 MiB, t=3, p=4) →
**ChaCha20-Poly1305** AEAD over a gzipped JSON envelope. The bundle is
self-describing — magic header `HLOOM`, version `1`, KDF params, nonce,
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
  and capture tagging — `gemma4:e4b` via `/api/chat`.
- **Vision captioning** for photo uploads — same model, same endpoint,
  `images: [b64]` field. ~1.7 s warm per photo on M4 Pro. When the
  on-device face recognizer (face-api.js, 128-d descriptors) clusters a
  face to a known person, the system prompt names them so the caption
  reads "Elena holding Maya at the kitchen window" rather than "a woman
  holding a child".
- **Embeddings** — `embeddinggemma` (300M params, 768-dim, 621 MB) for
  the shared text + caption vector space.

The custom `heirloom/gemma4-grounded` Modelfile bakes the grounding
contract into the system prompt; create it locally with
`ollama create heirloom/gemma4-grounded -f Modelfile`.

Audio understanding via Gemma 4 directly is upstream-blocked
([ollama/ollama#11798](https://github.com/ollama/ollama/issues/11798) — the
audio projector isn't published yet). Heirloom transcribes through
`whisper-cpp small.en` until then. See
[`docs/MULTIMODAL-ECOSYSTEM.md`](./docs/MULTIMODAL-ECOSYSTEM.md) for the
full analysis and the proposed bridge.

## Tech stack

- **Frontend** — Next.js 16 (App Router, RSC, Turbopack), Tailwind v4
  with custom `@theme static` tokens (warm-paper palette), Framer Motion,
  Source Serif 4 + Geist + JetBrains Mono.
- **Backend** — Next.js route handlers, postgres.js for SQL with
  per-request `withRls()` wrapping every transaction, argon2 for
  passphrases (executor + per-nominee), jose for JWT cookies.
- **AI runtime** — Ollama for everything supported, whisper-cpp for
  audio, face-api.js in the browser for face descriptors.
- **Database** — PostgreSQL 16 + pgvector, HNSW indexes on every 128 / 768
  dim vector column, RLS policies per-role (creator full read/write,
  nominee restricted to released captures only).
- **PWA** — manifest + apple-touch-icon, optional service worker in
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

- [`CLAUDE.md`](./CLAUDE.md) — product philosophy + engineering principles
- [`PLAN.md`](./PLAN.md) — technical plan + AI runtime decisions
- [`EXECUTION-PLAN.md`](./EXECUTION-PLAN.md) — phased v1 build sequence
- [`docs/MULTIMODAL-ECOSYSTEM.md`](./docs/MULTIMODAL-ECOSYSTEM.md) — Gemma 4
  multimodal notes + Ollama audio gap
- [`design-system/`](./design-system/) — design tokens, prototypes, handoff
  package (architecture, API contracts, schema, prompts, guardrails)

## License

Apache 2.0. Gemma 4 weights ship under their own Apache 2.0 license; the
Heirloom code is under the same. See [`LICENSE`](./LICENSE) (TBD before
public launch).

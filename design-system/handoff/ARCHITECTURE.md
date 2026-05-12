# ARCHITECTURE.md

System architecture for Heirloom v1.

---

## 1. System diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         CREATOR'S DEVICE                          │
│                                                                   │
│   Heirloom PWA (Next.js, installed on phone or laptop)            │
│   • Service worker (offline shell, queued saves)                  │
│   • IndexedDB (in-flight captures, draft text, queued uploads)    │
│   • Web Audio + getUserMedia for capture                          │
│                                                                   │
└────────────────────────────┬─────────────────────────────────────┘
                             │  HTTPS, JWT-authenticated REST
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                       VERCEL EDGE / CDN                           │
│   Serves the PWA shell + static assets. No app data.              │
└────────────────────────────┬─────────────────────────────────────┘
                             │  HTTPS, JWT-authenticated REST
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│             AZURE VM (Standard NC-series, GPU-equipped)           │
│                                                                   │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │  FastAPI (uvicorn + gunicorn, 4 workers)                │    │
│   │  • /capture, /thread, /reflect, /nominee, /executor     │    │
│   │  • /seal, /unseal, /verify-passphrase                   │    │
│   │  • All endpoints role-checked (creator vs nominee)      │    │
│   │  • All Reflection responses streamed (SSE)              │    │
│   └─────────────────────────────────────────────────────────┘    │
│                       │              │            │               │
│                       ▼              ▼            ▼               │
│   ┌─────────────────┐ ┌─────────────────┐ ┌──────────────────┐   │
│   │ Postgres 16     │ │ Ollama          │ │ Whisper large-v3 │   │
│   │ + pgvector      │ │                 │ │ (transcription)  │   │
│   │                 │ │ • Gemma 4 26B   │ │                  │   │
│   │ • RLS on every  │ │   (synthesis)   │ │ runs as          │   │
│   │   table         │ │ • Gemma 4 E4B   │ │ subprocess on    │   │
│   │ • Vector cols   │ │   (tag, prompt) │ │ capture commit   │   │
│   │   on captures,  │ │ • EmbeddingGemma│ │                  │   │
│   │   transcripts,  │ │   (embeddings)  │ │                  │   │
│   │   reflections   │ │                 │ │                  │   │
│   └─────────────────┘ └─────────────────┘ └──────────────────┘   │
│                                                                   │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │  Azure Blob Storage (mounted via blobfuse2)             │    │
│   │  • Audio originals (.opus, .m4a)                        │    │
│   │  • Video originals (.mp4)                               │    │
│   │  • Photo originals (.jpg, .heic)                        │    │
│   │  • Server-side AES-256 at rest                          │    │
│   └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Why this stack

| Choice | Reason |
|---|---|
| Next.js PWA on Vercel | Single codebase deploys to web + installable phone shell. App-Router gives us SSR for the cold-load shell + RSC for the auth gate. |
| FastAPI on Azure VM | We need a long-running server next to Ollama + Postgres. FastAPI's typed Pydantic models pair cleanly with TypeScript clients. |
| Postgres + pgvector | Single DB for relational + vector. RLS is the cleanest way to enforce creator/nominee isolation. |
| Ollama | Hosts the Gemma 4 synthesis variant, the smaller Gemma 4 variant, and EmbeddingGemma side-by-side. Single binary, easy to operate. |
| Gemma 4 26B for Reflection | Synthesis quality matters most when the user is grieving. 26B handles long context (multi-capture grounding) better than E4B. |
| Gemma 4 E4B for tagging + gentle prompts | Fast, cheap, runs in parallel with capture commit. Latency on the home page matters. |
| EmbeddingGemma | Same family, same tokenizer, consistent retrieval quality with the synthesis model. |
| Whisper large-v3 | Best open ASR. Runs on the same GPU. Transcript edits stored separately so the original is preserved. |
| Magic-link auth | Passwords are a footgun for a memory-vault app. Magic-link via short JWT keeps the security surface tiny. |
| Azure Blob Storage | Originals are large and cheap-to-cold. Blob storage scales without touching Postgres. |

---

## 3. Deployment topology

**One Azure VM** runs FastAPI + Postgres + Ollama + Whisper + blobfuse2 mount. **One Vercel project** serves the PWA. **One Azure Blob container** holds originals. That's it.

The VM is provisioned with:
- Ubuntu 22.04 LTS
- NVIDIA driver + CUDA 12.x
- Postgres 16 (apt, pgvector extension built from source)
- Ollama (latest)
- Python 3.11 + uv for dependency mgmt
- ffmpeg, libsndfile (audio/video preprocessing)
- nginx reverse proxy → uvicorn on 8000, with HTTPS (Let's Encrypt)

Models pre-pulled on first boot:
```bash
ollama pull gemma:4-26b
ollama pull gemma:4-e4b
ollama pull embedding-gemma:300m  # or current variant
```

---

## 4. Data flow — capture commit

```
1. User stops recording → client POSTs multipart to /capture (audio blob + metadata)
2. FastAPI writes the audio blob to Azure Blob, gets a blob_id
3. Insert row into `captures` (status='processing', blob_id, kind='audio')
4. Spawn background task:
   a. Whisper transcribes the audio → transcript text + timestamps
   b. Insert `transcripts` row
   c. EmbeddingGemma embeds transcript (chunked at 512 tokens, 64-token overlap)
   d. Insert `transcript_chunks` rows with vector column
   e. Gemma 4 E4B runs the tagging prompt → emotion + topic tags
   f. Insert `capture_tags` rows
   g. Update `captures.status='ready'`
5. Server-Sent Event on /capture/{id}/status streams each step to the client
6. Client renders the streaming transcript, then the tags appear when ready
```

---

## 5. Data flow — Reflection query

```
1. Nominee types a question → client POSTs to /reflect (creator_id, question, mode='server')
2. FastAPI:
   a. Embed the question with EmbeddingGemma
   b. pgvector top-k=8 over `transcript_chunks` where creator_id matches AND chunk's
      capture has been released to this nominee (RLS-enforced via JWT claim)
   c. If max similarity < 0.55 → return EMPTY_STATE_RESPONSE (no model call)
   d. Otherwise: build the Reflection prompt with retrieved chunks as context
   e. Stream Gemma 4 26B response with structured-output JSON contract
   f. Parse the streamed JSON incrementally → emit SSE events with claims+citations
3. Client renders each claim as it streams; citation chips become tappable
4. Tap a citation → /capture/{id} → drawer opens with original audio + transcript
```

---

## 6. Role enforcement

Two roles: **creator** and **nominee**. The JWT carries `{user_id, role, scope}` where `scope` is the set of `creator_id`s this principal can read.

- A **creator** can read their own `captures`, `threads`, `nominees`, `reflections`. Cannot read other creators' rows.
- A **nominee** can read `captures` where `creator_id IN scope` AND there is a `nominee_releases` row with `released_at <= now()`. Cannot write captures. Can write `reflections` (their own queries).
- An **executor** is a special nominee role: can call `/executor/release` with the executor passphrase, which atomically sets `released_at = now()` on all `nominee_releases` rows owned by that creator.

RLS policies enforce all of this at the row level. See `SCHEMA.sql` §3.

---

## 7. On-device LLM toggle (designed-in, stub for v1)

The `/reflect` endpoint accepts a `mode` parameter:
- `mode='server'` — v1 default. Uses Ollama on the Azure VM.
- `mode='device'` — v2. Reserved. Returns 501 in v1. When implemented, the client will run EmbeddingGemma via transformers.js + WebGPU and synthesis via a local Gemma 4 E4B running in-browser.

This keeps the API contract stable across v1 and v2.

---

## 8. Observability

- **Structured logs** to stdout (json), shipped to Azure Monitor
- **No PII in logs.** Capture text, transcripts, and Reflection queries are NEVER logged. Logs contain `capture_id` and `creator_id` only.
- **Metrics**: capture commit latency, Whisper latency, Reflection latency (split by retrieval vs synthesis), token counts, error rates. Prometheus endpoint on a private port.
- **Tracing**: OpenTelemetry, sampled at 5% (free tier in Azure Monitor).

---

## 9. Backup & recovery

- Postgres nightly `pg_dump` to a separate Azure Blob container, encrypted with a key only the creator holds (key derived from creator master passphrase, stored client-side).
- Blob storage versioning enabled (90-day retention).
- Recovery doc lives in `OPERATIONS.md` (not in this handoff package — for ops only, post-MVP).

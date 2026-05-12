# Heirloom — Technical Plan

## High-Level Goal

Build a beautiful, emotionally resonant, local-first multimodal memory companion powered by Gemma 4 running via Ollama.

The product should:

* preserve stories and memories
* organize multimodal family archives
* enable contextual retrieval
* maintain privacy through local inference
* feel humane and emotionally grounded

The primary success metric is:

> an emotionally compelling, trustworthy, end-to-end product experience.

---

## Recommended Technical Stack

### Frontend

* Next.js 15+
* App Router
* TypeScript

### UI

* Tailwind CSS
* shadcn/ui
* Framer Motion

### AI UI References

* assistant-ui
* ElevenLabs UI

### Design References

* Apple Journal
* Apple Photos Memories
* Calm
* Notion
* Tolan AI app

---

## Backend

### Recommended Approach

Prefer simplicity. Two acceptable shapes:

* **Option A — Next.js API routes only.** Best when inference fits behind a single HTTP boundary the frontend already needs.
* **Option B — FastAPI service.** Use when GPU-adjacent inference orchestration, long-running streams, or Python-native ML libraries (Whisper, transformers) are needed near the model host.

The v1 build uses Option B (see `EXECUTION-PLAN.md`).

---

## AI Runtime

### Primary Runtime

* Ollama

Reasons:

* fast local setup
* simple HTTP API
* runs Gemma 4 family side-by-side with EmbeddingGemma
* matches the local-first product story

---

## Gemma Models

### Primary Model

Gemma 4 via Ollama.

Variants used in the system:

* a larger variant for synthesis (Reflection answers, letter drafts)
* a smaller variant for fast, structured tasks (capture tagging, gentle follow-up prompts, prompt-of-day)

Use quantized variants for local performance where appropriate.

---

## Vector Database

### Recommended

Postgres with pgvector. Packaged with the app via Docker for portable deployments.

Requirements:

* lightweight
* local-first
* easy ingestion
* semantic retrieval

Do NOT overengineer distributed infra.

---

## Memory Ingestion Pipeline

### Supported Inputs

* photos
* voice notes
* videos
* documents
* journal entries
* chats

---

## Processing Pipeline

### Photos

* image captioning
* metadata extraction
* embeddings

### Audio

* transcription
* speaker tagging (optional)
* embeddings

### Video

* transcript extraction
* scene summaries

### Text

* chunking
* semantic indexing

---

## Additional Architecture Notes

### AI SDK / Development Philosophy

If using Next.js route handlers, the project should use:

* Vercel AI SDK
* https://ai-sdk.dev/

This SDK is the foundational development primitive for:

* streaming responses
* chat interfaces
* tool calling
* RAG pipelines
* multimodal workflows
* AI state management

Important: do not build AI orchestration or chat primitives from scratch unless absolutely necessary.

Before implementing custom infrastructure:

1. Read Vercel AI SDK documentation
2. Review cookbook examples
3. Reuse primitives and patterns already provided
4. Build the Heirloom emotional UX layer on top of existing foundations

Recommended references:

* https://ai-sdk.dev/cookbook/guides/rag-chatbot
* https://ai-sdk.dev/docs

The focus of this project should be:

* product experience
* emotional interaction design
* memory retrieval UX
* local AI integration

NOT:

* reinventing standard AI infra patterns

---

## Embeddings Strategy

### EmbeddingGemma (primary)

https://developers.googleblog.com/en/introducing-embeddinggemma/

EmbeddingGemma is the primary embedding model used for:

* semantic search
* contextual retrieval
* memory clustering
* multimodal indexing

This aligns with:

* the Gemma family ecosystem
* local-first architecture
* offline capability

EmbeddingGemma runs through the same Ollama host as the synthesis models. No external embedding APIs.

---

## Design Component Libraries

Primary UI / component references:

### shadcn/ui

https://ui.shadcn.com/

Use for:

* foundational UI primitives
* layout systems
* typography
* dialogs
* sheets
* cards

---

### ElevenLabs UI

https://ui.elevenlabs.io/

Use for inspiration around:

* conversational voice UX
* emotional interface design
* ambient interactions
* audio playback patterns
* warm visual systems

---

### assistant-ui

https://github.com/assistant-ui/assistant-ui

Use for:

* AI interaction primitives
* streaming interfaces
* chat architecture
* AI state handling
* composable assistant patterns

Use assistant-ui as infrastructure / primitives rather than exposing generic chatbot UX.

---

## Design References

Primary design references:

* ElevenLabs
* Tolan AI app
* Apple Journal
* Apple Photos Memories

The product should feel:

* emotionally warm
* reflective
* intimate
* cinematic
* calm

Avoid:

* developer tooling aesthetics
* dashboard-heavy layouts
* enterprise SaaS patterns
* futuristic "AI assistant" visuals

---

## Core Features

### 1. Guided Storytelling

Flow:

* The system asks a reflective prompt
* User records audio / text / video
* System indexes memories semantically

This is one of the emotional anchors of the project.

---

### 2. Memory Timeline

Features:

* chronological organization
* semantic grouping
* emotional categories
* visual browsing

Potential categories:

* Family
* Childhood
* Traditions
* Advice
* Milestones

---

### 3. Contextual Retrieval

Users can ask:

* "What advice did dad give about resilience?"
* "Show stories from our old home."
* "Find memories about travel."

The system retrieves:

* grounded memories
* real uploads
* associated audio / images

No hallucinations. If retrieval is empty, the answer is the empty state, verbatim.

---

### 4. Voice Playback

Approaches:

* replay original recordings
* optional voice synthesis only for the creator reading their own writing, gated behind a multi-step consent ceremony

Voice should feel archival and respectful. No open-ended simulated conversation.

---

## UI Architecture

### Recommended Information Architecture

#### Home

* Today's Memories
* Stories
* Voice Notes
* Timeline
* Family Archive

#### Capture

* Record story
* Upload photo / video
* Guided prompts

#### Explore

* Search memories
* Emotional themes
* Family history

#### Reflection

* Contextual retrieval
* Story playback
* Voice-guided memories

---

## Design Language

The UI should feel:

* warm
* slow
* cinematic
* intimate
* spacious

Use:

* large typography
* smooth animations
* soft gradients
* subtle motion

Avoid:

* dashboards
* terminal aesthetics
* dense enterprise layouts

---

## Build Phases

### Phase 1 — Foundation

Goal:
Working local-first AI stack.

Tasks:

* set up Next.js
* install Tailwind + shadcn
* set up Ollama
* pull Gemma 4 (synthesis + small variant)
* set up EmbeddingGemma
* set up Postgres + pgvector
* basic chat / retrieval API

Deliverable:
basic semantic retrieval working locally.

---

### Phase 2 — Memory System

Goal:
Build ingestion and retrieval flows.

Tasks:

* upload pipeline
* embeddings generation
* indexing
* retrieval with grounding gate
* memory metadata schema

Deliverable:
retrievable multimodal memory archive.

---

### Phase 3 — Emotional UX

Goal:
Transform the prototype into a believable product.

Tasks:

* onboarding
* guided storytelling
* voice flows
* memory cards
* timeline UI
* animations
* transitions

Deliverable:
emotionally compelling product experience.

The per-phase execution checklist for v1 lives in `EXECUTION-PLAN.md`.

---

## Potential Open Source Components

Useful references:

* https://github.com/assistant-ui/assistant-ui
* https://ui.elevenlabs.io/
* LobeChat

Use them for:

* inspiration
* primitives
* interaction patterns

Avoid directly cloning generic chatbot UX.

---

## Final Product Goal

The final experience should feel like:

> a beautifully preserved family archive powered by private local AI.

NOT:

> an AI chatbot pretending to be a person.

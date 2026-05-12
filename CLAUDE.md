# Heirloom — Project Context & Engineering Guide

## Project Overview

Heirloom is a private, local-first legacy companion.

It helps people preserve stories, memories, values, voice notes, family history, and emotional presence across generations — especially during emotionally significant life periods such as terminal illness, caregiving, aging, or major life transitions.

This is NOT:

* an AI therapist
* a grief chatbot
* a "digital resurrection" system
* an attempt to simulate consciousness

This IS:

* a memory preservation system
* a contextual family archive
* a multimodal storytelling companion
* a privacy-first emotional computing application

The product should feel humane, calm, intimate, emotionally safe, and dignified.

The emotional framing is:

> "Preserve presence across generations."

---

## Product Philosophy

The app should feel closer to:

* Apple Photos Memories
* a family scrapbook
* a private memory archive
* a reflective journaling experience

NOT:

* ChatGPT
* Discord
* AI dashboards
* futuristic "assistant" UIs

The AI should feel:

* subtle
* grounded
* calm
* minimally invasive

Conversation + memory exploration.

---

## Core Product Features

### 1. Guided Memory Capture

The app gently prompts users to share — if they wish — and record:

* life stories
* lessons
* memories
* family traditions
* values
* advice
* important moments

Example prompts:

* "Tell me about your childhood home."
* "What life lesson do you want your children to remember?" — ask first whether they have children, or who they intend to reach.
* "Describe one of your happiest memories."

The capture surface never assumes a context (e.g. terminal diagnosis); the user leads.

---

### 2. Multimodal Memory Ingestion

Users can upload:

* photos
* videos
* voice notes
* documents
* chats
* journal entries

The system should:

* extract metadata
* create embeddings
* organize memories semantically
* cluster related memories

---

### 3. Contextual Memory Retrieval

Users should be able to ask:

* "Tell me one of mom's stories about resilience."
* "Show memories from our old house."
* "What advice did dad give about relationships?"

Retrieval should be:

* grounded
* contextual
* archival
* emotionally respectful

The system never fabricates. If retrieval has nothing to ground on, it says so plainly.

---

### 4. Voice-Preserved Playback

Voice interaction focuses on:

* storytelling
* playback
* memory narration
* preserved messages

The system never:

* pretends the person is currently alive
* simulates open-ended conversation as the creator
* generates new first-person speech in the creator's voice

---

## Technical Direction

### Frontend

* Next.js (App Router)
* TypeScript
* Tailwind CSS
* shadcn/ui
* Framer Motion
* Vercel AI SDK as the primitives layer for streaming, tool calling, and AI state — see PLAN.md

### UI References

* ElevenLabs UI
* assistant-ui
* Apple Journal
* Apple Photos Memories
* Calm app
* Notion

### Backend

* Next.js API routes
  OR
* FastAPI lightweight backend (preferred when GPU-adjacent inference orchestration is needed)

### AI Runtime

* Ollama
* Gemma 4

Do NOT overengineer.

---

## Ollama / Gemma Setup

Expected local setup:

* Ollama installed locally (or on a single inference host)
* Gemma 4 models pulled (synthesis + smaller variant for fast tagging)
* Embedding model available (EmbeddingGemma)

The application functions offline / local-first whenever possible. Privacy is a core product principle.

---

## Architecture Philosophy

The application is NOT a chatbot with RAG.

It is:

> a memory operating system.

Core primitives:

* memory ingestion
* emotional tagging
* semantic retrieval
* timeline reconstruction
* storytelling
* voice-guided reflection

Chat becomes a secondary interaction layer.

---

## UX Principles

### Visual Direction

The app should feel:

* warm
* spacious
* emotionally calm
* tactile
* human
* soft

Avoid:

* cyberpunk aesthetics
* neon AI branding
* terminal/dev interfaces

Use:

* large typography
* smooth transitions
* gentle gradients
* ambient motion
* cinematic layouts

The full visual system, tokens, components, motion primitives, and copy register are specified in `design-system/DESIGN.md` and `design-system/Heirloom Design System.html`.

---

## Git Guidelines

Use normal git commits. Do not add co-authors automatically.

---

## Important Ethical Constraints

DO NOT:

* simulate consciousness
* claim someone "still exists"
* encourage emotional dependency
* fabricate memories
* manipulate grief

The system behaves as:

* a preserved memory archive
* a contextual retrieval system
* a storytelling companion

Authenticity matters more than realism.

---

## v1 Priorities

v1 ships:

1. Beautiful onboarding
2. Guided memory recording
3. Photo / audio upload
4. Semantic retrieval with grounded citations
5. Emotional memory playback
6. Polished mobile-first UX
7. Nominee designation and sealed-letter handoff

Avoid:

* excessive AI features
* complicated infra
* multi-agent orchestration
* premature fine-tuning

The execution plan for v1 lives in `EXECUTION-PLAN.md`.

---

## Non-Goals

Do NOT optimize for:

* AGI-style intelligence
* autonomous agents
* productivity workflows
* enterprise AI patterns

Optimize for:

* dignity
* emotional continuity
* memory preservation
* privacy
* calm UX

---

## Branding

Project name:

### Heirloom

Tagline:

> "Preserve presence across generations."

Alternates:

* "Stories that stay."
* "Memories held with care."
* "A private archive of the people we love."

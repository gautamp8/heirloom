# Heirloom

A private, local-first legacy companion. Preserve presence across generations.

## Where to start

- **[`AGENTS.md`](./AGENTS.md)** — agent runtime pointer.
- **[`CLAUDE.md`](./CLAUDE.md)** — product context and engineering principles.
- **[`PLAN.md`](./PLAN.md)** — technical stack and embeddings strategy.
- **[`EXECUTION-PLAN.md`](./EXECUTION-PLAN.md)** — phase-by-phase v1 build sequence.
- **[`design-system/`](./design-system/)** — visual system, prototypes, handoff package (architecture, API contracts, schema, prompts, guardrails).

## Local development

Requires macOS, Apple Silicon recommended.

```bash
# Preflight: install local stack
brew install ollama postgresql@17 pgvector whisper-cpp
brew services start ollama
brew services start postgresql@17

# Pull models (~10 GB)
ollama pull embeddinggemma
ollama pull gemma4:e4b

# Configure environment
cp .env.example .env.local

# Install + run
pnpm install
pnpm dev
```

The app boots at `http://localhost:3000`. Health check at `/api/health`.

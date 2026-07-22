-- Provider layer state (see src/lib/provider/):
--
-- 1. app_settings: instance-level key/value store. First tenant is the
--    BYOK provider configuration a creator saves in Settings. The API key
--    lives here — on the user's own machine or self-hosted box — and is
--    deliberately NOT covered by any heirloom_app grant: only the admin
--    pool (trusted server code) can touch it, and the settings route
--    masks the key on read. RLS with no policies = deny-all for app role.
--
-- 2. vaults.embedding_meta: which embedding model built this vault's
--    vector index ({"identity": "ollama/embeddinggemma@768", ...}).
--    Vectors from one embedder must never be compared against another's;
--    src/lib/embedding-guard.ts enforces this and
--    scripts/reindex-embeddings.ts migrates a vault between embedders.

CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE vaults ADD COLUMN IF NOT EXISTS embedding_meta JSONB;

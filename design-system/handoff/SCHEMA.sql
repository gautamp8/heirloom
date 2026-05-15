-- SCHEMA.sql
-- Heirloom v1 Postgres schema. Postgres 16 + pgvector.
-- All tables have RLS policies enforced at the database layer.

-- =========================================================================
-- §1  Extensions
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================================
-- §2  Tables
-- =========================================================================

-- Users - both creators and nominees. Role is per-relationship, not per-user.
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           CITEXT UNIQUE NOT NULL,
    display_name    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A "vault" is one creator's archive. One user can own multiple vaults
-- (e.g. one for each grandchild) - though v1 ships single-vault per user.
CREATE TABLE vaults (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name            TEXT NOT NULL DEFAULT 'My Archive',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A capture is a single piece of content: audio, photo, note, or video.
CREATE TYPE capture_kind AS ENUM ('audio', 'photo', 'note', 'video');
CREATE TYPE capture_status AS ENUM ('processing', 'ready', 'failed');

CREATE TABLE captures (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_id        UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    kind            capture_kind NOT NULL,
    status          capture_status NOT NULL DEFAULT 'processing',
    title           TEXT,                  -- nullable; auto-suggested by Gemma
    caption         TEXT,                  -- for photo + video
    body            TEXT,                  -- for note kind (full text)
    blob_url        TEXT,                  -- audio/photo/video original
    duration_ms     INTEGER,               -- audio/video only
    captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_captures_vault_captured ON captures(vault_id, captured_at DESC);

-- Transcripts are 1:1 with audio/video captures.
CREATE TABLE transcripts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    capture_id      UUID NOT NULL UNIQUE REFERENCES captures(id) ON DELETE CASCADE,
    text            TEXT NOT NULL,
    language        TEXT NOT NULL DEFAULT 'en',
    word_timestamps JSONB,                 -- [{word, start_ms, end_ms}, ...]
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chunks are what we retrieve over. ~512 tokens, ~64-token overlap.
CREATE TABLE transcript_chunks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    capture_id      UUID NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    vault_id        UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    text            TEXT NOT NULL,
    start_ms        INTEGER,               -- for audio/video
    end_ms          INTEGER,
    embedding       VECTOR(768) NOT NULL,  -- EmbeddingGemma 300m output dim
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chunks_embedding ON transcript_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_chunks_vault ON transcript_chunks(vault_id);

-- Tags emitted by Gemma 4 E4B at commit time.
CREATE TYPE tag_kind AS ENUM ('emotion', 'topic', 'person', 'place');

CREATE TABLE capture_tags (
    capture_id      UUID NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    kind            tag_kind NOT NULL,
    value           TEXT NOT NULL,
    confidence      REAL,
    PRIMARY KEY (capture_id, kind, value)
);
CREATE INDEX idx_tags_value ON capture_tags(kind, value);

-- Threads group multiple captures around a topic ("Stories about your father")
CREATE TABLE threads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_id        UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    color           TEXT NOT NULL DEFAULT 'oxblood', -- oxblood|sepia|moss|muted
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE thread_captures (
    thread_id       UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    capture_id      UUID NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (thread_id, capture_id)
);

-- Nominees are people who will receive the archive (or pieces of it).
CREATE TYPE nominee_role AS ENUM ('recipient', 'executor');
CREATE TYPE release_trigger AS ENUM ('scheduled', 'by_request', 'executor_unlock');

CREATE TABLE nominees (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_id            UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id             UUID REFERENCES users(id),    -- null until they claim
    name                TEXT NOT NULL,
    relationship        TEXT,
    email               CITEXT,
    role                nominee_role NOT NULL DEFAULT 'recipient',
    letter_body         TEXT,                          -- the sealed letter
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (nominee × capture_or_thread) release assignment.
CREATE TABLE nominee_releases (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nominee_id          UUID NOT NULL REFERENCES nominees(id) ON DELETE CASCADE,
    vault_id            UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    capture_id          UUID REFERENCES captures(id) ON DELETE CASCADE,
    thread_id           UUID REFERENCES threads(id) ON DELETE CASCADE,
    trigger             release_trigger NOT NULL,
    release_at          TIMESTAMPTZ,                   -- when 'scheduled'
    released_at         TIMESTAMPTZ,                   -- when actually released
    label               TEXT,                          -- "for your 25th birthday"
    CHECK ((capture_id IS NOT NULL) <> (thread_id IS NOT NULL))
);
CREATE INDEX idx_releases_nominee ON nominee_releases(nominee_id, released_at);

-- Executor passphrase storage. One row per vault. Argon2id hash only.
CREATE TABLE executor_credentials (
    vault_id            UUID PRIMARY KEY REFERENCES vaults(id) ON DELETE CASCADE,
    nominee_id          UUID NOT NULL REFERENCES nominees(id),
    passphrase_hash     TEXT NOT NULL,    -- argon2id, never plaintext
    used_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reflection sessions - append-only, scoped to a single nominee asking.
CREATE TABLE reflections (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_id            UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id),
    question            TEXT NOT NULL,
    question_embedding  VECTOR(768),
    answer_json         JSONB,             -- {claims: [{text, citations}], status}
    grounded            BOOLEAN NOT NULL,  -- false → returned empty state
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Saved passages (nominee bookmarks)
CREATE TABLE saved_passages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    capture_id      UUID NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    excerpt         TEXT NOT NULL,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Magic-link auth (short-lived; cleaned by cron)
CREATE TABLE auth_tokens (
    token_hash      TEXT PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ
);

-- =========================================================================
-- §3  Row-Level Security
-- =========================================================================

ALTER TABLE captures               ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_chunks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_tags           ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads                ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_captures        ENABLE ROW LEVEL SECURITY;
ALTER TABLE nominees               ENABLE ROW LEVEL SECURITY;
ALTER TABLE nominee_releases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflections            ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_passages         ENABLE ROW LEVEL SECURITY;

-- The application connects as a `heirloom_app` role and sets two session GUCs
-- per request: app.user_id and app.role ('creator' or 'nominee')
-- See API_CONTRACTS.md §2 for how FastAPI sets these.

-- Creator can read/write their own vault's captures
CREATE POLICY creator_captures ON captures
    FOR ALL TO heirloom_app
    USING (
        current_setting('app.role') = 'creator'
        AND vault_id IN (
            SELECT id FROM vaults
            WHERE creator_id = current_setting('app.user_id')::uuid
        )
    );

-- Nominee can read released captures only
CREATE POLICY nominee_captures ON captures
    FOR SELECT TO heirloom_app
    USING (
        current_setting('app.role') = 'nominee'
        AND id IN (
            SELECT capture_id FROM nominee_releases nr
            JOIN nominees n ON nr.nominee_id = n.id
            WHERE n.user_id = current_setting('app.user_id')::uuid
              AND nr.released_at IS NOT NULL
              AND nr.released_at <= now()
        )
    );

-- Identical pattern applies to transcripts, transcript_chunks, capture_tags
-- (joined through capture_id → captures.id, same gate).
-- Threads + thread_captures: gated by vault membership for creators,
-- and by membership in nominee_releases for nominees.

-- Reflections: nominee can read+write their own; creator can read all in their vault
CREATE POLICY reflection_owner ON reflections
    FOR ALL TO heirloom_app
    USING (user_id = current_setting('app.user_id')::uuid);

CREATE POLICY reflection_creator_read ON reflections
    FOR SELECT TO heirloom_app
    USING (
        current_setting('app.role') = 'creator'
        AND vault_id IN (
            SELECT id FROM vaults
            WHERE creator_id = current_setting('app.user_id')::uuid
        )
    );

-- =========================================================================
-- §4  Constraints worth flagging
-- =========================================================================

-- Captures are immutable after status='ready'. Enforced by trigger.
CREATE OR REPLACE FUNCTION captures_immutable_after_ready()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'ready' AND (
        NEW.body IS DISTINCT FROM OLD.body OR
        NEW.caption IS DISTINCT FROM OLD.caption OR
        NEW.blob_url IS DISTINCT FROM OLD.blob_url OR
        NEW.duration_ms IS DISTINCT FROM OLD.duration_ms
    ) THEN
        RAISE EXCEPTION 'Captures are immutable after ready. Create a revision instead.';
    END IF;
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_captures_immutable
    BEFORE UPDATE ON captures
    FOR EACH ROW EXECUTE FUNCTION captures_immutable_after_ready();

-- Executor passphrase cannot be set twice without explicit rotation
ALTER TABLE executor_credentials ADD CONSTRAINT one_per_vault UNIQUE (vault_id);

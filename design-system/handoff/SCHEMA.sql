-- SCHEMA.sql
-- Heirloom Postgres baseline. Postgres 16 + pgvector.
--
-- Applied first by the bootstrap (./install.sh, infra/vm-setup.sh,
-- infra/build-and-start.sh), then every file under migrations/*.sql in
-- numeric order. The SQLite mirror for the desktop bundle lives at
-- migrations/sqlite/001_schema.sql.
--
-- Migrations layered on top of this baseline:
--   001_complete_rls_policies.sql  - the full RLS policy set (transcripts,
--                                    chunks, tags, threads, nominees,
--                                    releases, saved_passages)
--   002_legacy_features.sql        - people, face_appearances, life_events,
--                                    sealed_letters, nominee_states,
--                                    nominees.passphrase_hash
--   003_vault_onboarded.sql        - vaults.onboarded_at
--   004_push_subscriptions.sql     - push_subscriptions for Web Push
--   005_voice_profiles.sql         - voice_profiles for TTS
--   006_identity_index.sql         - captures.is_profile + the nominee
--                                    RLS escape hatch for profile chunks

-- =========================================================================
-- §1  Extensions
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- =========================================================================
-- §2  Tables
-- =========================================================================

-- Users - one row per real person (creator or nominee).
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           CITEXT UNIQUE NOT NULL,
    display_name    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A "vault" is one creator's archive. v1 ships single-vault per user.
CREATE TABLE vaults (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name            TEXT NOT NULL DEFAULT 'My Archive',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    -- vaults.onboarded_at TIMESTAMPTZ is added by migration 003
);

-- A capture is a single piece of content: audio, photo, note, or video.
CREATE TYPE capture_kind   AS ENUM ('audio', 'photo', 'note', 'video');
CREATE TYPE capture_status AS ENUM ('processing', 'ready', 'failed');

CREATE TABLE captures (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_id        UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    kind            capture_kind NOT NULL,
    status          capture_status NOT NULL DEFAULT 'processing',
    title           TEXT,                  -- nullable; auto-suggested by Gemma
    caption         TEXT,                  -- for photo + video; also vision caption
    body            TEXT,                  -- for note kind (full text)
    blob_url        TEXT,                  -- audio/photo/video original, relative path
    duration_ms     INTEGER,               -- audio/video only
    captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    -- captures.is_profile BOOLEAN is added by migration 006
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

-- Chunks are what Reflection retrieves over.
-- EmbeddingGemma 300m output dim = 768.
CREATE TABLE transcript_chunks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    capture_id      UUID NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    vault_id        UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    text            TEXT NOT NULL,
    start_ms        INTEGER,               -- for audio/video
    end_ms          INTEGER,
    embedding       VECTOR(768) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chunks_embedding ON transcript_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_chunks_vault ON transcript_chunks(vault_id);

-- Tags emitted by Gemma 4 e4b at commit time.
CREATE TYPE tag_kind AS ENUM ('emotion', 'topic', 'person', 'place');

CREATE TABLE capture_tags (
    capture_id      UUID NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    kind            tag_kind NOT NULL,
    value           TEXT NOT NULL,
    confidence      REAL,
    PRIMARY KEY (capture_id, kind, value)
);
CREATE INDEX idx_tags_value ON capture_tags(kind, value);

-- Threads group multiple captures around a topic. Tables exist; no UI yet.
CREATE TABLE threads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_id        UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    color           TEXT NOT NULL DEFAULT 'oxblood',  -- oxblood|sepia|moss|muted
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE thread_captures (
    thread_id       UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    capture_id      UUID NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (thread_id, capture_id)
);

-- Nominees are people who will receive the archive (or pieces of it).
-- nominees.passphrase_hash + passphrase_set_at are added by migration 002.
CREATE TYPE nominee_role    AS ENUM ('recipient', 'executor');
CREATE TYPE release_trigger AS ENUM ('scheduled', 'by_request', 'executor_unlock');

CREATE TABLE nominees (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_id            UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id             UUID REFERENCES users(id),
    name                TEXT NOT NULL,
    relationship        TEXT,
    email               CITEXT,
    role                nominee_role NOT NULL DEFAULT 'recipient',
    letter_body         TEXT,                          -- the framing letter
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (nominee × capture_or_thread) release assignment. Captures
-- auto-release to every nominee at pipeline-end by default; sealed
-- letters release through the condition engine.
CREATE TABLE nominee_releases (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nominee_id          UUID NOT NULL REFERENCES nominees(id) ON DELETE CASCADE,
    vault_id            UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    capture_id          UUID REFERENCES captures(id) ON DELETE CASCADE,
    thread_id           UUID REFERENCES threads(id) ON DELETE CASCADE,
    trigger             release_trigger NOT NULL,
    release_at          TIMESTAMPTZ,
    released_at         TIMESTAMPTZ,
    label               TEXT,
    CHECK ((capture_id IS NOT NULL) <> (thread_id IS NOT NULL))
);
CREATE INDEX idx_releases_nominee ON nominee_releases(nominee_id, released_at);
CREATE UNIQUE INDEX idx_releases_capture_nominee
    ON nominee_releases(nominee_id, capture_id)
    WHERE capture_id IS NOT NULL;

-- Executor passphrase storage. One row per vault. Argon2id hash only.
CREATE TABLE executor_credentials (
    vault_id            UUID PRIMARY KEY REFERENCES vaults(id) ON DELETE CASCADE,
    nominee_id          UUID NOT NULL REFERENCES nominees(id),
    passphrase_hash     TEXT NOT NULL,
    used_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reflection sessions - append-only, scoped per user (the asking party).
CREATE TABLE reflections (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_id            UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id),
    question            TEXT NOT NULL,
    question_embedding  VECTOR(768),
    answer_json         JSONB,                  -- {answer, claims, diagnostics, ...}
    grounded            BOOLEAN NOT NULL,       -- false → empty state
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Saved passages (nominee bookmarks). Table exists; no UI yet.
CREATE TABLE saved_passages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    capture_id      UUID NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    excerpt         TEXT NOT NULL,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Magic-link auth tokens. Designed; not used in current build (sessions
-- are issued at portal-passphrase entry). Kept for forward-compat.
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

-- The application connects as a `heirloom_app` role and sets two session
-- GUCs per request: app.user_id and app.role ('creator' or 'nominee'). See
-- API_CONTRACTS.md §2 and src/lib/db/postgres.ts (`withRls`).

-- Creator can read/write everything in their own vault.
CREATE POLICY creator_captures ON captures
    FOR ALL TO heirloom_app
    USING (
        current_setting('app.role') = 'creator'
        AND vault_id IN (
            SELECT id FROM vaults
            WHERE creator_id = current_setting('app.user_id')::uuid
        )
    );

-- Nominee can read released captures only. Migration 006 adds an
-- alternative path for is_profile = true captures so retrieval can
-- answer identity questions without a release row.
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

-- The full creator + nominee policy set for transcripts / chunks / tags /
-- threads / nominees / nominee_releases / saved_passages lives in
-- migrations/001_complete_rls_policies.sql.

-- Reflections: every user reads + writes their own; the creator reads
-- everything in their vault (audit).
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
-- §4  Triggers
-- =========================================================================

-- Captures are immutable after status='ready' for body/caption/blob/duration.
-- Title + tags remain editable post-ready.
CREATE OR REPLACE FUNCTION captures_immutable_after_ready()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'ready' AND (
        NEW.body        IS DISTINCT FROM OLD.body OR
        NEW.caption     IS DISTINCT FROM OLD.caption OR
        NEW.blob_url    IS DISTINCT FROM OLD.blob_url OR
        NEW.duration_ms IS DISTINCT FROM OLD.duration_ms
    ) THEN
        RAISE EXCEPTION 'Captures are immutable after ready.';
    END IF;
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_captures_immutable
    BEFORE UPDATE ON captures
    FOR EACH ROW EXECUTE FUNCTION captures_immutable_after_ready();

-- Executor passphrase cannot be set twice without explicit rotation.
ALTER TABLE executor_credentials ADD CONSTRAINT one_per_vault UNIQUE (vault_id);

-- The rest of the schema (people, face_appearances, life_events,
-- sealed_letters, nominee_states, push_subscriptions, voice_profiles,
-- captures.is_profile) is layered on by migrations/00[2-6]*.sql.

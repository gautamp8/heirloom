-- Heirloom — SQLite schema for the bundled desktop build.
--
-- Mirrors design-system/handoff/SCHEMA.sql + migrations/00[1-4].sql in
-- shape, with these systematic substitutions:
--   uuid           → TEXT (UUIDs generated in app code)
--   timestamptz    → TEXT (ISO 8601)
--   citext         → TEXT COLLATE NOCASE
--   JSONB          → TEXT (stringified JSON)
--   VECTOR(N)      → BLOB (Float32 LE)
--   ENUM types     → TEXT CHECK
--   DEFAULT now()  → DEFAULT CURRENT_TIMESTAMP
--   pgvector ops   → sqlite-vec functions (vec_distance_cosine)
--
-- RLS is dropped entirely — the desktop build is single-user.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    email           TEXT UNIQUE NOT NULL COLLATE NOCASE,
    display_name    TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vaults (
    id              TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    creator_id      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name            TEXT NOT NULL DEFAULT 'My Archive',
    onboarded_at    TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS captures (
    id              TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    vault_id        TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('audio', 'photo', 'note', 'video')),
    status          TEXT NOT NULL DEFAULT 'processing'
                       CHECK (status IN ('processing', 'ready', 'failed')),
    title           TEXT,
    caption         TEXT,
    body            TEXT,
    blob_url        TEXT,
    duration_ms     INTEGER,
    captured_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_captures_vault_captured
    ON captures(vault_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS transcripts (
    id              TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    capture_id      TEXT NOT NULL UNIQUE REFERENCES captures(id) ON DELETE CASCADE,
    text            TEXT NOT NULL,
    language        TEXT NOT NULL DEFAULT 'en',
    word_timestamps TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transcript_chunks (
    id              TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    capture_id      TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    vault_id        TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    text            TEXT NOT NULL,
    start_ms        INTEGER,
    end_ms          INTEGER,
    embedding       BLOB NOT NULL,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chunks_vault ON transcript_chunks(vault_id);

CREATE TABLE IF NOT EXISTS capture_tags (
    capture_id      TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL
                       CHECK (kind IN ('emotion', 'topic', 'person', 'place')),
    value           TEXT NOT NULL,
    confidence      REAL,
    PRIMARY KEY (capture_id, kind, value)
);
CREATE INDEX IF NOT EXISTS idx_tags_value ON capture_tags(kind, value);

CREATE TABLE IF NOT EXISTS threads (
    id              TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    vault_id        TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    color           TEXT NOT NULL DEFAULT 'oxblood',
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS thread_captures (
    thread_id       TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    capture_id      TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (thread_id, capture_id)
);

CREATE TABLE IF NOT EXISTS nominees (
    id                  TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    vault_id            TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id             TEXT REFERENCES users(id),
    name                TEXT NOT NULL,
    relationship        TEXT,
    email               TEXT COLLATE NOCASE,
    role                TEXT NOT NULL DEFAULT 'recipient'
                           CHECK (role IN ('recipient', 'executor')),
    letter_body         TEXT,
    passphrase_hash     TEXT,
    passphrase_set_at   TEXT,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS nominee_releases (
    id                  TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    nominee_id          TEXT NOT NULL REFERENCES nominees(id) ON DELETE CASCADE,
    vault_id            TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    capture_id          TEXT REFERENCES captures(id) ON DELETE CASCADE,
    thread_id           TEXT REFERENCES threads(id) ON DELETE CASCADE,
    trigger             TEXT NOT NULL
                           CHECK (trigger IN ('scheduled', 'by_request', 'executor_unlock')),
    release_at          TEXT,
    released_at         TEXT,
    label               TEXT,
    CHECK ((capture_id IS NOT NULL) <> (thread_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_releases_nominee
    ON nominee_releases(nominee_id, released_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_releases_capture_nominee
    ON nominee_releases(nominee_id, capture_id) WHERE capture_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS executor_credentials (
    vault_id            TEXT PRIMARY KEY REFERENCES vaults(id) ON DELETE CASCADE,
    nominee_id          TEXT NOT NULL REFERENCES nominees(id),
    passphrase_hash     TEXT NOT NULL,
    used_at             TEXT,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reflections (
    id                  TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    vault_id            TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id             TEXT NOT NULL REFERENCES users(id),
    question            TEXT NOT NULL,
    question_embedding  BLOB,
    answer_json         TEXT,
    grounded            INTEGER NOT NULL,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS people (
    id                  TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    vault_id            TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    display_name        TEXT,
    relation            TEXT,
    user_id             TEXT REFERENCES users(id) ON DELETE SET NULL,
    nominee_id          TEXT REFERENCES nominees(id) ON DELETE SET NULL,
    reference_embedding BLOB,
    appearance_count    INTEGER NOT NULL DEFAULT 0,
    confirmed           INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_people_vault ON people(vault_id);

CREATE TABLE IF NOT EXISTS face_appearances (
    id                  TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    capture_id          TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    vault_id            TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    person_id           TEXT REFERENCES people(id) ON DELETE SET NULL,
    bbox                TEXT NOT NULL,
    embedding           BLOB NOT NULL,
    similarity          REAL,
    confirmed           INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_face_capture ON face_appearances(capture_id);
CREATE INDEX IF NOT EXISTS idx_face_person ON face_appearances(person_id);

CREATE TABLE IF NOT EXISTS life_events (
    id                  TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    vault_id            TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    subject_person_id   TEXT REFERENCES people(id) ON DELETE SET NULL,
    kind                TEXT NOT NULL,
    label               TEXT NOT NULL,
    event_date          TEXT,
    recurrence          TEXT,
    description         TEXT,
    embedding           BLOB,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_life_events_vault ON life_events(vault_id);
CREATE INDEX IF NOT EXISTS idx_life_events_date ON life_events(event_date);

CREATE TABLE IF NOT EXISTS sealed_letters (
    id                  TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    capture_id          TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    vault_id            TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    to_nominee_id       TEXT REFERENCES nominees(id) ON DELETE CASCADE,
    occasion_prompt     TEXT NOT NULL,
    intent_embedding    BLOB,
    conditions          TEXT NOT NULL,
    unlocked_at         TEXT,
    unlocked_by_trigger TEXT,
    next_check_at       TEXT,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_letters_vault ON sealed_letters(vault_id);
CREATE INDEX IF NOT EXISTS idx_letters_nominee ON sealed_letters(to_nominee_id);

CREATE TABLE IF NOT EXISTS nominee_states (
    id              TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    nominee_id      TEXT NOT NULL REFERENCES nominees(id) ON DELETE CASCADE,
    vault_id        TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    state_label     TEXT NOT NULL,
    state_embedding BLOB,
    fired_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_states_nominee ON nominee_states(nominee_id, fired_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id              TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint        TEXT NOT NULL,
    p256dh          TEXT NOT NULL,
    auth            TEXT NOT NULL,
    user_agent      TEXT,
    enabled_daily   INTEGER NOT NULL DEFAULT 1,
    enabled_letters INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at    TEXT,
    UNIQUE (user_id, endpoint)
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
    ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS saved_passages (
    id              TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    capture_id      TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    excerpt         TEXT NOT NULL,
    note            TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash      TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at      TEXT NOT NULL,
    used_at         TEXT
);

CREATE TABLE IF NOT EXISTS voice_profiles (
    id              TEXT PRIMARY KEY DEFAULT (gen_uuid()),
    vault_id        TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    voice_id        TEXT NOT NULL,
    blob_url        TEXT NOT NULL,
    reference_text  TEXT NOT NULL,
    duration_ms     INTEGER,
    sample_rate     INTEGER,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (vault_id)
);

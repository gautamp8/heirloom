-- Migration 002 - legacy preservation features
--
-- Adds:
--   • people              - face-identity per vault (creator + nominees + family)
--   • face_appearances    - bbox + 128-dim embedding per face per photo
--   • life_events         - anchor dates (birthdays, anniversaries, losses)
--   • sealed_letters      - captures with conditional unlock rules
--   • nominee_states      - moods/states logged by nominees, drive state triggers
--   • nominees.passphrase_hash - per-nominee argon2id, replaces dev shortcut
--
-- Design notes:
--   • Sealed-letter unlocks fire by inserting a row into the existing
--     nominee_releases table - this means the existing RLS gates on
--     transcripts / chunks / tags / captures keep working unchanged.
--   • Face embeddings are 128-dim (face-api.js ResNet-34 descriptor).
--   • All embedding fields are stored - none are derived from the others.

-- =========================================================================
-- §1  Auth: per-nominee passphrase hash
-- =========================================================================

ALTER TABLE nominees
    ADD COLUMN IF NOT EXISTS passphrase_hash TEXT,
    ADD COLUMN IF NOT EXISTS passphrase_set_at TIMESTAMPTZ;

-- =========================================================================
-- §2  People - face-identity clusters within a vault
-- =========================================================================

CREATE TABLE IF NOT EXISTS people (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_id        UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    display_name    TEXT,
    relation        TEXT,                    -- 'self' | 'spouse' | 'child' | ...
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    nominee_id      UUID REFERENCES nominees(id) ON DELETE SET NULL,
    reference_embedding VECTOR(128),         -- seed selfie's face-api.js descriptor
    appearance_count INTEGER NOT NULL DEFAULT 0,
    confirmed       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_vault ON people(vault_id);
CREATE INDEX IF NOT EXISTS idx_people_embedding ON people
    USING hnsw (reference_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

ALTER TABLE people ENABLE ROW LEVEL SECURITY;

CREATE POLICY creator_people ON people FOR ALL TO heirloom_app
USING (
    current_setting('app.role') = 'creator'
    AND vault_id IN (
        SELECT id FROM vaults WHERE creator_id = current_setting('app.user_id')::uuid
    )
);

CREATE POLICY nominee_people ON people FOR SELECT TO heirloom_app
USING (
    current_setting('app.role') = 'nominee'
    AND vault_id IN (
        SELECT n.vault_id FROM nominees n WHERE n.user_id = current_setting('app.user_id')::uuid
    )
);

-- =========================================================================
-- §3  Face appearances - one row per detected face per capture
-- =========================================================================

CREATE TABLE IF NOT EXISTS face_appearances (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    capture_id      UUID NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    vault_id        UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    person_id       UUID REFERENCES people(id) ON DELETE SET NULL,
    bbox            JSONB NOT NULL,          -- {x, y, w, h} in 0..1 normalized
    embedding       VECTOR(128) NOT NULL,
    similarity      REAL,                    -- to person_id (NULL if unclustered)
    confirmed       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_face_capture ON face_appearances(capture_id);
CREATE INDEX IF NOT EXISTS idx_face_person ON face_appearances(person_id);
CREATE INDEX IF NOT EXISTS idx_face_embedding ON face_appearances
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

ALTER TABLE face_appearances ENABLE ROW LEVEL SECURITY;

CREATE POLICY creator_faces ON face_appearances FOR ALL TO heirloom_app
USING (
    current_setting('app.role') = 'creator'
    AND vault_id IN (
        SELECT id FROM vaults WHERE creator_id = current_setting('app.user_id')::uuid
    )
);

CREATE POLICY nominee_faces ON face_appearances FOR SELECT TO heirloom_app
USING (
    current_setting('app.role') = 'nominee'
    AND capture_id IN (
        SELECT nr.capture_id FROM nominee_releases nr
        JOIN nominees n ON nr.nominee_id = n.id
        WHERE n.user_id = current_setting('app.user_id')::uuid
          AND nr.released_at IS NOT NULL
          AND nr.released_at <= now()
    )
);

-- =========================================================================
-- §4  Life events - birthdays, anniversaries, losses, milestones
-- =========================================================================

CREATE TABLE IF NOT EXISTS life_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_id        UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    subject_person_id UUID REFERENCES people(id) ON DELETE SET NULL,
    kind            TEXT NOT NULL,           -- 'birth' | 'anniversary' | 'wedding' |
                                              -- 'graduation' | 'loss' | 'milestone'
    label           TEXT NOT NULL,           -- 'Rita''s birthday', 'Sam turns 18'
    event_date      DATE,
    recurrence      TEXT,                    -- 'yearly' | 'once' | null
    description     TEXT,
    embedding       VECTOR(768),             -- EmbeddingGemma over label+description
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_life_events_vault ON life_events(vault_id);
CREATE INDEX IF NOT EXISTS idx_life_events_date ON life_events(event_date);
CREATE INDEX IF NOT EXISTS idx_life_events_embedding ON life_events
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

ALTER TABLE life_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY creator_life_events ON life_events FOR ALL TO heirloom_app
USING (
    current_setting('app.role') = 'creator'
    AND vault_id IN (
        SELECT id FROM vaults WHERE creator_id = current_setting('app.user_id')::uuid
    )
);

CREATE POLICY nominee_life_events ON life_events FOR SELECT TO heirloom_app
USING (
    current_setting('app.role') = 'nominee'
    AND vault_id IN (
        SELECT n.vault_id FROM nominees n WHERE n.user_id = current_setting('app.user_id')::uuid
    )
);

-- =========================================================================
-- §5  Sealed letters - captures with conditional unlock rules
--
-- The conditions JSONB is a small DSL:
--   {"any_of": [
--     {"kind": "date", "date": "2030-04-12"},
--     {"kind": "life_event", "event_kind": "wedding", "subject_person_id": "..."},
--     {"kind": "calendar", "rule": "anniversary_of_loss"},
--     {"kind": "state", "state": "struggling"},
--     {"kind": "semantic_match", "threshold": 0.55, "topic": "feeling lost"},
--     {"kind": "first_visit"}
--   ]}
--
-- Each fire mechanism inserts into nominee_releases - the existing RLS gates
-- then make the underlying capture visible to the nominee.
-- =========================================================================

CREATE TABLE IF NOT EXISTS sealed_letters (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    capture_id      UUID NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
    vault_id        UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    to_nominee_id   UUID REFERENCES nominees(id) ON DELETE CASCADE,  -- null = all
    occasion_prompt TEXT NOT NULL,
    intent_embedding VECTOR(768),
    conditions      JSONB NOT NULL,
    unlocked_at     TIMESTAMPTZ,
    unlocked_by_trigger TEXT,                -- which condition kind fired
    next_check_at   TIMESTAMPTZ,             -- denormalized for cron efficiency
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_letters_vault ON sealed_letters(vault_id);
CREATE INDEX IF NOT EXISTS idx_letters_nominee ON sealed_letters(to_nominee_id);
CREATE INDEX IF NOT EXISTS idx_letters_pending ON sealed_letters(next_check_at)
    WHERE unlocked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_letters_intent_embedding ON sealed_letters
    USING hnsw (intent_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

ALTER TABLE sealed_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY creator_letters ON sealed_letters FOR ALL TO heirloom_app
USING (
    current_setting('app.role') = 'creator'
    AND vault_id IN (
        SELECT id FROM vaults WHERE creator_id = current_setting('app.user_id')::uuid
    )
);

CREATE POLICY nominee_letters ON sealed_letters FOR SELECT TO heirloom_app
USING (
    current_setting('app.role') = 'nominee'
    AND unlocked_at IS NOT NULL
    AND (
        to_nominee_id IS NULL
        OR to_nominee_id IN (
            SELECT id FROM nominees WHERE user_id = current_setting('app.user_id')::uuid
        )
    )
);

-- =========================================================================
-- §6  Nominee states - moods/states tapped by nominees, drive state triggers
-- =========================================================================

CREATE TABLE IF NOT EXISTS nominee_states (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nominee_id      UUID NOT NULL REFERENCES nominees(id) ON DELETE CASCADE,
    vault_id        UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    state_label     TEXT NOT NULL,           -- 'I miss you' | 'I need advice' |
                                              -- 'On hard days' | 'Big moment' | free-text
    state_embedding VECTOR(768),
    fired_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_states_nominee ON nominee_states(nominee_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_states_embedding ON nominee_states
    USING hnsw (state_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

ALTER TABLE nominee_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY nominee_states_self ON nominee_states FOR ALL TO heirloom_app
USING (
    current_setting('app.role') = 'nominee'
    AND nominee_id IN (
        SELECT id FROM nominees WHERE user_id = current_setting('app.user_id')::uuid
    )
);

CREATE POLICY creator_states_audit ON nominee_states FOR SELECT TO heirloom_app
USING (
    current_setting('app.role') = 'creator'
    AND vault_id IN (
        SELECT id FROM vaults WHERE creator_id = current_setting('app.user_id')::uuid
    )
);

-- A creator may have at most one voice profile (single-creator-per-vault).
-- The reference wav is stored on disk; the row tracks the voice_id the
-- TTS sidecar uses for cache + synthesis, plus the transcript the
-- creator was asked to read.

CREATE TABLE IF NOT EXISTS voice_profiles (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id        uuid NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    voice_id        text NOT NULL,          -- sidecar's cache key (sha256 prefix of wav)
    blob_url        text NOT NULL,          -- reference wav, relative to storage root
    reference_text  text NOT NULL,          -- what we asked them to read
    duration_ms     integer,
    sample_rate     integer,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (vault_id)
);

ALTER TABLE voice_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS voice_profiles_creator ON voice_profiles;
CREATE POLICY voice_profiles_creator ON voice_profiles
    FOR ALL
    USING (
        current_setting('app.role', true) = 'creator'
        AND vault_id IN (
            SELECT id FROM vaults
            WHERE creator_id = current_setting('app.user_id', true)::uuid
        )
    );

-- Nominees can SELECT the voice_id of their creator's profile (needed
-- to play back the creator's voice on captures + reflections) but
-- nothing else.
DROP POLICY IF EXISTS voice_profiles_nominee_read ON voice_profiles;
CREATE POLICY voice_profiles_nominee_read ON voice_profiles
    FOR SELECT
    USING (
        current_setting('app.role', true) = 'nominee'
        AND vault_id IN (
            SELECT n.vault_id FROM nominees n
            WHERE n.user_id = current_setting('app.user_id', true)::uuid
        )
    );

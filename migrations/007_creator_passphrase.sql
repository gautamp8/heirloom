-- Each creator gets their own passphrase so they can sign out (e.g. to
-- log in as a nominee on someone else's archive) and come back later.
-- Stored as an argon2id hash; the plaintext is shown once at creation
-- and regenerated on demand from Settings.

ALTER TABLE users ADD COLUMN IF NOT EXISTS passphrase_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS passphrase_set_at TIMESTAMPTZ;

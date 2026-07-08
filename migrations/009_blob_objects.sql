-- 009_blob_objects.sql
--
-- Optional Postgres-backed blob store, selected at runtime with
-- HEIRLOOM_BLOB_BACKEND=postgres. The default filesystem backend
-- (storage/blobs on a persistent disk) is unchanged and used by the
-- desktop app and any VM deploy; this table only carries bytes when the
-- host has no persistent disk — namely the Vercel hosted demo, where the
-- serverless filesystem is ephemeral and read-only.
--
-- Access is exclusively through the admin (owner) connection in
-- src/lib/storage.ts: blob_url is an unguessable UUID path that a caller
-- can only obtain via an RLS-checked captures/voice_profiles row, so the
-- table itself is deliberately NOT granted to heirloom_app and carries no
-- RLS of its own — the owning capture is the access-control boundary.

CREATE TABLE IF NOT EXISTS blob_objects (
    blob_url   TEXT PRIMARY KEY,
    mime       TEXT,
    bytes      BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

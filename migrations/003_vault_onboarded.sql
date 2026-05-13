-- Migration 003 — track per-vault onboarding completion.
--
-- We use the presence of `vaults.onboarded_at` to decide whether to redirect
-- a fresh creator into the 4-step welcome.

ALTER TABLE vaults
    ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

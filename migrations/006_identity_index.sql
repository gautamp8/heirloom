-- Identity index: a single hidden "profile" capture per vault carries the
-- creator's biographical facts (name, life events, nominees, sealed-letter
-- titles) so retrieval can answer "who is X?" / "when were you born?"
-- without requiring the creator to write those things into a real note.
--
-- The capture sits in `captures` like everything else so chunking + RLS
-- machinery is reused, but is_profile = true hides it from timeline /
-- album / home queries. The nominee chunks RLS gets an alternative path
-- that lets nominees read profile chunks of vaults they belong to,
-- without needing a nominee_releases row.

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS is_profile BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_captures_vault_profile
  ON captures (vault_id) WHERE is_profile = true;

-- Nominee captures policy needs to surface profile captures too so that
-- the chunks policy below can JOIN through captures (RLS applies inside
-- the inner SELECT). Profile rows don't have a nominee_releases row;
-- they're authorized purely by being a profile of a vault the nominee
-- belongs to.
DROP POLICY IF EXISTS nominee_captures ON captures;
CREATE POLICY nominee_captures ON captures
  FOR SELECT TO heirloom_app
  USING (
    current_setting('app.role') = 'nominee'
    AND (
      id IN (
        SELECT nr.capture_id FROM nominee_releases nr
        JOIN nominees n ON nr.nominee_id = n.id
        WHERE n.user_id = current_setting('app.user_id')::uuid
          AND nr.released_at IS NOT NULL
          AND nr.released_at <= now()
      )
      OR (
        is_profile = true
        AND vault_id IN (
          SELECT vault_id FROM nominees
          WHERE user_id = current_setting('app.user_id')::uuid
        )
      )
    )
  );

DROP POLICY IF EXISTS nominee_chunks ON transcript_chunks;

CREATE POLICY nominee_chunks ON transcript_chunks
  FOR SELECT TO heirloom_app
  USING (
    current_setting('app.role') = 'nominee'
    AND (
      capture_id IN (
        SELECT nr.capture_id FROM nominee_releases nr
        JOIN nominees n ON nr.nominee_id = n.id
        WHERE n.user_id = current_setting('app.user_id')::uuid
          AND nr.released_at IS NOT NULL
          AND nr.released_at <= now()
      )
      OR capture_id IN (
        SELECT c.id FROM captures c
        JOIN nominees n ON n.vault_id = c.vault_id
        WHERE c.is_profile = true
          AND n.user_id = current_setting('app.user_id')::uuid
      )
    )
  );

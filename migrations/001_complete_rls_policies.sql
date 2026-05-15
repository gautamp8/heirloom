-- Add the missing RLS policies for tables whose schema enabled RLS but
-- defined no policy. Same gate as captures: creator owns the vault,
-- nominee has a released_at row.

-- transcripts -----------------------------------------------------------
CREATE POLICY creator_transcripts ON transcripts FOR ALL TO heirloom_app
USING (
    current_setting('app.role') = 'creator'
    AND capture_id IN (
        SELECT id FROM captures WHERE vault_id IN (
            SELECT id FROM vaults WHERE creator_id = current_setting('app.user_id')::uuid
        )
    )
);

CREATE POLICY nominee_transcripts ON transcripts FOR SELECT TO heirloom_app
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

-- transcript_chunks -----------------------------------------------------
CREATE POLICY creator_chunks ON transcript_chunks FOR ALL TO heirloom_app
USING (
    current_setting('app.role') = 'creator'
    AND vault_id IN (
        SELECT id FROM vaults WHERE creator_id = current_setting('app.user_id')::uuid
    )
);

CREATE POLICY nominee_chunks ON transcript_chunks FOR SELECT TO heirloom_app
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

-- capture_tags ----------------------------------------------------------
CREATE POLICY creator_tags ON capture_tags FOR ALL TO heirloom_app
USING (
    current_setting('app.role') = 'creator'
    AND capture_id IN (
        SELECT id FROM captures WHERE vault_id IN (
            SELECT id FROM vaults WHERE creator_id = current_setting('app.user_id')::uuid
        )
    )
);

CREATE POLICY nominee_tags ON capture_tags FOR SELECT TO heirloom_app
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

-- threads + thread_captures --------------------------------------------
CREATE POLICY creator_threads ON threads FOR ALL TO heirloom_app
USING (
    current_setting('app.role') = 'creator'
    AND vault_id IN (
        SELECT id FROM vaults WHERE creator_id = current_setting('app.user_id')::uuid
    )
);

CREATE POLICY creator_thread_captures ON thread_captures FOR ALL TO heirloom_app
USING (
    current_setting('app.role') = 'creator'
    AND thread_id IN (
        SELECT id FROM threads WHERE vault_id IN (
            SELECT id FROM vaults WHERE creator_id = current_setting('app.user_id')::uuid
        )
    )
);

-- nominees + nominee_releases ------------------------------------------
CREATE POLICY creator_nominees ON nominees FOR ALL TO heirloom_app
USING (
    current_setting('app.role') = 'creator'
    AND vault_id IN (
        SELECT id FROM vaults WHERE creator_id = current_setting('app.user_id')::uuid
    )
);

CREATE POLICY creator_releases ON nominee_releases FOR ALL TO heirloom_app
USING (
    current_setting('app.role') = 'creator'
    AND vault_id IN (
        SELECT id FROM vaults WHERE creator_id = current_setting('app.user_id')::uuid
    )
);

CREATE POLICY nominee_self_releases ON nominee_releases FOR SELECT TO heirloom_app
USING (
    current_setting('app.role') = 'nominee'
    AND nominee_id IN (
        SELECT id FROM nominees WHERE user_id = current_setting('app.user_id')::uuid
    )
);

-- saved_passages -------------------------------------------------------
CREATE POLICY nominee_saved ON saved_passages FOR ALL TO heirloom_app
USING (
    user_id = current_setting('app.user_id')::uuid
);

-- nominee_self read - nominees see their own row in `nominees`
CREATE POLICY nominee_self ON nominees FOR SELECT TO heirloom_app
USING (
    current_setting('app.role') = 'nominee'
    AND user_id = current_setting('app.user_id')::uuid
);

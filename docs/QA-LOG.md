# QA log

Running log of bugs found and fixed on the way to launch. Newest at the top.
Each entry: what broke, how it was caught, what the fix was.

## 2026-07-07

**SQLite init crashed on any pre-`is_profile` database.** Caught while
verifying the desktop splash against a dev server on the sqlite backend:
`/api/health` reported the database down. `getDb()` executes
`migrations/sqlite/001_schema.sql` on every open, and that file creates a
partial index `ON captures(vault_id) WHERE is_profile = 1`. On a database
created before the `is_profile` column existed, `CREATE TABLE IF NOT EXISTS`
skips the table, the column never appears, and the index statement throws —
taking the whole app down. The idempotent `ALTER TABLE ... ADD COLUMN`
backfills ran *after* the schema file, i.e. never. Fix: run the backfills
first, tolerating both `duplicate column name` (column already there) and
`no such table` (fresh database). This would have hit every v0.1.0-rc.1
desktop install on upgrade, since the packaged app re-syncs server code but
keeps the user's database. (`src/lib/db/sqlite.ts`)

**Desktop splash verified end-to-end in-browser before committing.** The
uncommitted May WIP (fixed port candidates 47384–47387, CORS on
`/api/health`, model auto-pull splash) was exercised against a real dev
server on port 47384: the splash probed the candidate ports, recognized the
Heirloom health payload, and pivoted to the live portal. All four splash
states (welcome, one-time setup, download progress, error) render correctly
with the bundled fonts and seal. True first-run (no models present) still to
be tested in the packaged .app.

**Provider layer verified on the local profile.** After introducing the
provider abstraction (local / BYOK / hosted-demo), the full nominee flow was
re-run against the pg backend: seed import (now embedding through the
provider layer), envelope auto-open via `?p=`, a grounded reflection with a
citation chip (top similarity 0.55 vs floor 0.30, floor now provider-scoped
and recorded per-row in diagnostics), and a fabrication-bait question
("What did you think about bitcoin?") that collapsed to the verbatim empty
state. Zero behavior change on the local path, as required.

**Open QA item: reflection answers can end mid-sentence.** The saved answer
for the pale-blue-dot question stopped at "…reveals that on it exists" —
structurally valid JSON, passed all gates, but the prose is truncated.
Predates the provider change (same model/prompt/params). To quantify in the
WS2 eval suite; suspect gemma4:e4b stopping early on long structured
outputs.

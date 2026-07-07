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

**Cloud models refuse to quote the Sagan passages — fixed with a
paraphrase-first prompt and one silent retry.** First hosted-demo run
(Azure, gpt-5.4-mini) surfaced two cross-provider bugs. One: Azure's
strict JSON-schema mode requires every property in `required`, so the
optional `tone` field made every request 400 — `tone` turned out to be
generated-but-never-read, so it's simply gone. Two: on "What did you
write about the pale blue dot?", the model refused 4/5 runs — not a
capability gap but 2025+-era copyright tuning: the seed notes are famous
published passages, and the model splices "I'm sorry, I cannot assist"
mid-JSON while reproducing them, corrupting the stream. Older permissive
models (gpt-4o-mini, gpt-4.1-mini) are deprecating on Azure and can't be
newly deployed. Measured the ladder on the worst-case question:
ownership framing 2/6, "quote sparingly" 4/6 on 5.4-mini, 5/6 on
gpt-5.5. Fix that holds on the cheap model: answers now retell in third
person with at most one short quoted phrase (the citation drawer serves
the full original from the database, no model in that path), the reflect
route retries synthesis once non-streaming, and any residual failure
still collapses to the verbatim empty state — 8/8 on gpt-5.4-mini.
Bonus: the local gemma answers stopped truncating mid-sentence, since
they no longer reproduce whole passages either.

**Hosted-copy honesty item for the demo (WS6):** the welcome page footer
says "LOCAL-FIRST · NOTHING LEAVES THIS DEVICE" — false on the hosted
demo. That line (and any siblings) must be profile-aware before the demo
URL goes anywhere.

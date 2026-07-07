/** Postgres (server) / SQLite (desktop bundle) backend dispatcher.
 *  Selected at import time via HEIRLOOM_BACKEND. */

/* eslint-disable @typescript-eslint/no-require-imports --
   require() keeps this module synchronous; a dynamic import() would force
   every consumer of `sql` to await the backend selection. */
const backend = process.env.HEIRLOOM_BACKEND === "sqlite"
  ? (require("./sqlite") as typeof import("./postgres"))
  : (require("./postgres") as typeof import("./postgres"));
/* eslint-enable @typescript-eslint/no-require-imports */

export const sql = backend.sql;
export const sqlAdmin = backend.sqlAdmin;
export const withRls = backend.withRls;
export const vec = backend.vec;
export const cosineDist = backend.cosineDist;
export const cosineSim = backend.cosineSim;

/** Datetime columns come back as Date from the Postgres driver and as
 *  ISO strings from better-sqlite3. Normalise both to ISO-8601. */
export function asISO(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return v;
}

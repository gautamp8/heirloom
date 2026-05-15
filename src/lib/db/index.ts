/** Postgres (server) / SQLite (desktop bundle) backend dispatcher.
 *  Selected at import time via HEIRLOOM_BACKEND. */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const backend = process.env.HEIRLOOM_BACKEND === "sqlite"
  ? (require("./sqlite") as typeof import("./postgres"))
  : (require("./postgres") as typeof import("./postgres"));

export const sql = backend.sql;
export const sqlAdmin = backend.sqlAdmin;
export const withRls = backend.withRls;
export const vec = backend.vec;
export const cosineDist = backend.cosineDist;
export const cosineSim = backend.cosineSim;

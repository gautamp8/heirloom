/**
 * Database backend dispatcher.
 *
 * Two backends share the same public surface:
 *   - postgres (default): postgres.js against PostgreSQL 16 + pgvector
 *   - sqlite  (HEIRLOOM_BACKEND=sqlite): better-sqlite3 + sqlite-vec,
 *     used by the bundled macOS desktop app.
 *
 * Call sites import from this module:
 *
 *   import { sql, withRls, vec, cosineSim } from "@/lib/db";
 *
 * and stay backend-agnostic.
 */

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

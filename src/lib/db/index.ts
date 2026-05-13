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

export { sql, sqlAdmin, withRls, vec, cosineDist, cosineSim } from "./postgres";

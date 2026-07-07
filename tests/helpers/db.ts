import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

// src/lib/db/index.ts selects its backend with a synchronous require();
// under vitest that require() goes through Node, which cannot load .ts
// modules on its own. tsx's CJS hook teaches require() to compile
// TypeScript so the dispatcher can reach ./sqlite.ts.
import "tsx/cjs";

/**
 * Point the app's DB layer at a throwaway SQLite file. MUST be called
 * before anything imports `@/lib/db` — the backend is frozen at import
 * time — so tests use `await setupSqlite()` first and then dynamic-import
 * whatever they exercise.
 */
export async function setupSqlite() {
  const dir = mkdtempSync(path.join(tmpdir(), "heirloom-test-"));
  process.env.HEIRLOOM_BACKEND = "sqlite";
  process.env.HEIRLOOM_SQLITE_PATH = path.join(dir, "test.sqlite");
  // The sqlite module reads the schema from migrations/sqlite relative to
  // cwd, which vitest keeps at the repo root.
  const db = await import("@/lib/db");
  return db;
}

type Sql = Awaited<ReturnType<typeof setupSqlite>>["sql"];

/** Minimal creator + vault, returns ids. */
export async function seedVault(sql: Sql) {
  const user_id = randomUUID();
  const vault_id = randomUUID();
  await sql`INSERT INTO users (id, email, display_name)
            VALUES (${user_id}, ${`${user_id}@test.local`}, ${"Test Creator"})`;
  await sql`INSERT INTO vaults (id, creator_id, name, onboarded_at)
            VALUES (${vault_id}, ${user_id}, ${"Test Archive"}, ${new Date().toISOString()})`;
  return { user_id, vault_id };
}

/** A deterministic 768-dim unit vector whose direction is controlled by
 *  `seed`, so tests can construct pairs with known cosine similarity:
 *  same seed → 1.0, orthogonal seeds → ~0. */
export function unitVec(seed: number, dims = 768): number[] {
  const v = new Array(dims).fill(0);
  v[seed % dims] = 1;
  return v;
}

/** Blend two unit vectors to hit an exact cosine similarity vs `unitVec(a)`. */
export function vecWithSimilarity(
  a: number,
  b: number,
  sim: number,
  dims = 768,
): number[] {
  const v = new Array(dims).fill(0);
  v[a % dims] = sim;
  v[b % dims] = Math.sqrt(1 - sim * sim);
  return v;
}

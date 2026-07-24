/**
 * Backend-aware fixture database for the E2E specs.
 *
 * Specs need direct DB access to set up and verify state the UI doesn't
 * expose (create a second vault, read a capture's pipeline status, mint an
 * executor passphrase, inspect push subscriptions). They used to
 * hardcode `postgres(E2E_DB_URL)`, which is why they failed under
 * E2E_BACKEND=sqlite — that connection points at a Postgres the sqlite
 * run never creates.
 *
 * `e2eDb()` returns a connection for whichever engine the run targets:
 *   - postgres: a fresh client per call (matching the old per-spec
 *     pool), closed by end().
 *   - sqlite: the app's own admin tag against the seeded E2E file, shared
 *     for the run (end() is a no-op — the single file connection persists).
 *
 * `vec(arr)` builds a portable embedding value — a pgvector literal on
 * Postgres, a serialized sqlite-vec blob on SQLite — so fixture vector
 * inserts drop the raw `::vector` cast.
 */
import { E2E_SQLITE_PATH, E2E_SQLITE_BLOB_DIR } from "./global-setup";

const E2E_DB_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://gautam_prajapati@localhost:5433/heirloom_e2e";

export type FixtureSql = {
  // postgres.js returns Promise<T> where callers pass the ROW-ARRAY type
  // (e.g. sql<{ id: string }[]>), so T already is the array. Loosely
  // typed because the two backends' tag types differ structurally;
  // fixtures only use the tagged call, .json, and .unsafe.
  <T = unknown[]>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  json: (v: unknown) => unknown;
  unsafe: (raw: string) => unknown;
};

export type FixtureDb = {
  sql: FixtureSql;
  vec: (arr: number[]) => unknown;
  end: () => Promise<void>;
};

function sqliteDb(): FixtureDb {
  process.env.HEIRLOOM_BACKEND = "sqlite";
  process.env.HEIRLOOM_SQLITE_PATH = E2E_SQLITE_PATH;
  process.env.HEIRLOOM_BLOB_DIR = E2E_SQLITE_BLOB_DIR;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const db = require("../../src/lib/db") as {
    sqlAdmin: FixtureSql | null;
    vec: FixtureDb["vec"];
  };
  if (!db.sqlAdmin) throw new Error("e2eDb(sqlite): no admin connection");
  return { sql: db.sqlAdmin, vec: db.vec, end: async () => {} };
}

function postgresDb(): FixtureDb {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const postgres = require("postgres") as (
    url: string,
    opts?: Record<string, unknown>,
  ) => FixtureSql & { end: () => Promise<void> };
  const sql = postgres(E2E_DB_URL, { max: 2, transform: { undefined: null } });
  return {
    sql,
    // A pgvector literal: interpolate the "[...]" string as a param, cast
    // to ::vector. Returns a fragment bound to this same client.
    vec: (arr: number[]) =>
      (sql as unknown as (s: TemplateStringsArray, ...v: unknown[]) => unknown)`${`[${arr.join(",")}]`}::vector` as unknown,
    end: () => sql.end(),
  };
}

export function e2eDb(): FixtureDb {
  return process.env.E2E_BACKEND === "sqlite" ? sqliteDb() : postgresDb();
}

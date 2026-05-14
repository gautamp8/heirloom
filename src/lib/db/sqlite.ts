/**
 * SQLite backend for the bundled macOS desktop build.
 *
 * Exposes the same public surface as `./postgres.ts` so call sites stay
 * backend-agnostic:
 *   - sql, sqlAdmin: callable tagged-template that runs queries
 *   - withRls: no-op transaction (single-user)
 *   - vec, cosineDist, cosineSim: portable SQL helpers
 *
 * Vector columns are stored as little-endian Float32 BLOBs and queried
 * with sqlite-vec's vec_distance_cosine().
 */

import Database, { type Database as DatabaseT } from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

const FRAGMENT = Symbol.for("heirloom.sqlFragment");

type Fragment = {
  [FRAGMENT]: true;
  sql: string;
  params: unknown[];
};

function isFragment(v: unknown): v is Fragment {
  return !!(v && typeof v === "object" && FRAGMENT in (v as object));
}

function frag(sql: string, params: unknown[] = []): Fragment {
  return { [FRAGMENT]: true, sql, params };
}

function serializeVec(arr: number[]): Buffer {
  const buf = Buffer.alloc(arr.length * 4);
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i], i * 4);
  return buf;
}

function bindValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return v;
  if (Array.isArray(v) || typeof v === "object") return JSON.stringify(v);
  return v;
}

function compile(
  strings: TemplateStringsArray,
  values: unknown[],
): Fragment {
  let sqlText = "";
  const params: unknown[] = [];
  for (let i = 0; i < strings.length; i++) {
    sqlText += strings[i];
    if (i >= values.length) continue;
    const v = values[i];
    if (isFragment(v)) {
      sqlText += v.sql;
      params.push(...v.params);
    } else if (v === undefined || v === null) {
      sqlText += "?";
      params.push(null);
    } else {
      sqlText += "?";
      params.push(bindValue(v));
    }
  }
  return frag(sqlText, params);
}

// Lazy-init the database so sqlite-vec (an async-loaded ESM under
// Turbopack) has time to finish initializing before we call .load().
let _db: DatabaseT | null = null;
async function getDb(): Promise<DatabaseT> {
  if (_db) return _db;
  const dbPath =
    process.env.HEIRLOOM_SQLITE_PATH ??
    path.resolve(process.cwd(), "heirloom-dev.sqlite");
  const d = new Database(dbPath);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  const sqliteVec = await import("sqlite-vec");
  sqliteVec.load(d);

  // Shim a few Postgres builtins so cross-backend SQL keeps working.
  // SQLite has CURRENT_TIMESTAMP but not now(); register an alias.
  d.function("now", () => new Date().toISOString());

  // Canonical UUIDv4 generator used as the DEFAULT for every id column.
  // Sticking to RFC 4122 format means the existing zod .uuid() validators
  // on cited capture_ids etc. keep working under both backends.
  d.function("gen_uuid", { deterministic: false }, () => randomUUID());
  const schemaPath = path.resolve(
    process.cwd(),
    "migrations/sqlite/001_schema.sql",
  );
  if (fs.existsSync(schemaPath)) {
    d.exec(fs.readFileSync(schemaPath, "utf8"));
  }
  _db = d;
  return d;
}

async function runFragment<T = unknown>(f: Fragment): Promise<T[]> {
  const db = await getDb();
  const stmt = db.prepare(f.sql);
  if (stmt.reader) {
    return stmt.all(...(f.params as unknown[])) as T[];
  }
  stmt.run(...(f.params as unknown[]));
  return [] as T[];
}

type Thenable<T = unknown> = Fragment & PromiseLike<T>;

function makeThenable<T = unknown>(f: Fragment): Thenable<T> {
  const t = { ...f } as Thenable<T>;
  t.then = function then<R1 = T, R2 = never>(
    onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return runFragment<T>(f).then(
      (rows) => rows as unknown as T,
      undefined,
    ).then(onFulfilled ?? undefined, onRejected ?? undefined);
  } as Thenable<T>["then"];
  return t;
}

type TagFn = {
  <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Thenable<T>;
  unsafe: (raw: string) => Fragment;
  json: (v: unknown) => Fragment;
  begin: <T>(fn: (tx: TagFn) => Promise<T>) => Promise<T>;
};

function makeTag(): TagFn {
  const tag = function tag<T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Thenable<T> {
    return makeThenable<T>(compile(strings, values));
  } as TagFn;

  tag.unsafe = (raw: string) => frag(raw, []);
  tag.json = (v: unknown) => frag("?", [JSON.stringify(v)]);

  tag.begin = async <T>(fn: (tx: TagFn) => Promise<T>): Promise<T> => {
    const db = await getDb();
    db.exec("BEGIN");
    try {
      const inner = makeTag();
      const result = await fn(inner);
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };

  return tag;
}

export const sql = makeTag();
export const sqlAdmin = sql;

export async function withRls<T>(
  _userId: string,
  _role: "creator" | "nominee",
  fn: (tx: TagFn) => Promise<T>,
): Promise<T> {
  return sql.begin(fn);
}

// Portable SQL helpers — sqlite-vec versions.

export function vec(arr: number[]): Fragment {
  return frag("?", [serializeVec(arr)]);
}

export function cosineDist(column: string, query: number[]): Fragment {
  return frag(`vec_distance_cosine(${column}, ?)`, [serializeVec(query)]);
}

export function cosineSim(column: string, query: number[]): Fragment {
  return frag(`(1.0 - vec_distance_cosine(${column}, ?))`, [
    serializeVec(query),
  ]);
}

/** Generate a UUID. Postgres has gen_random_uuid(); SQLite needs the
 *  caller to provide one. */
export function newId(): string {
  return randomUUID();
}

import postgres from "postgres";

// `next build` evaluates route modules to collect page data, which pulls
// this module in. Skip the hard requirement during the build phase (Next
// sets NEXT_PHASE) so a deploy can compile even before DATABASE_URL is
// wired; it is still required at runtime. The pool is lazy — postgres.js
// does not connect until the first query — so the build placeholder never
// opens a socket.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const url = process.env.DATABASE_URL;
if (!url && !isBuildPhase) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}
const effectiveUrl = url ?? "postgres://build@127.0.0.1:5432/build";

// postgres.js prepared statements break on a transaction-mode pooler
// (Neon's `-pooler` host / PgBouncer), which is what a serverless deploy
// must use to avoid connection exhaustion. Disable them there — detected
// from the host, or forced with HEIRLOOM_DB_PREPARE=false. On a plain VM
// (direct connection) prepared statements stay on.
function pooled(connStr: string): boolean {
  return (
    process.env.HEIRLOOM_DB_PREPARE === "false" || /-pooler\./.test(connStr)
  );
}
const POOL_MAX = Number(process.env.HEIRLOOM_DB_POOL_MAX) || 8;

declare global {
  var __heirloomSql: ReturnType<typeof postgres> | undefined;
  var __heirloomSqlAdmin: ReturnType<typeof postgres> | undefined;
}

export const sql =
  globalThis.__heirloomSql ??
  postgres(effectiveUrl, {
    max: POOL_MAX,
    idle_timeout: 30,
    connect_timeout: 10,
    transform: { undefined: null },
    prepare: !pooled(effectiveUrl),
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__heirloomSql = sql;
}

/** Superuser connection for trusted server code that must read across
 *  RLS tables before a session exists (bootstrap, passphrase auth).
 *  Never use to serve user requests directly. */
export const sqlAdmin: ReturnType<typeof postgres> | null = (() => {
  if (globalThis.__heirloomSqlAdmin) return globalThis.__heirloomSqlAdmin;
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) return null;
  const client = postgres(adminUrl, {
    max: Math.min(2, POOL_MAX),
    idle_timeout: 30,
    connect_timeout: 10,
    transform: { undefined: null },
    prepare: !pooled(adminUrl),
  });
  if (process.env.NODE_ENV !== "production") {
    globalThis.__heirloomSqlAdmin = client;
  }
  return client;
})();

/** Transaction with per-request RLS GUCs (`app.user_id`, `app.role`)
 *  set so policies key off the current principal. */
export async function withRls<T>(
  userId: string,
  role: "creator" | "nominee",
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.user_id', ${userId}, true)`;
    await tx`SELECT set_config('app.role', ${role}, true)`;
    return fn(tx);
  })) as T;
}

function vectorLiteral(arr: number[]): string {
  return `[${arr.join(",")}]`;
}

export function vec(arr: number[]) {
  return sql`${vectorLiteral(arr)}::vector`;
}

/** Cosine distance in `[0, 2]` (smaller = closer). */
export function cosineDist(column: string, query: number[]) {
  return sql`(${sql.unsafe(column)} <=> ${vectorLiteral(query)}::vector)`;
}

/** Cosine similarity in `[-1, 1]` (larger = closer). */
export function cosineSim(column: string, query: number[]) {
  return sql`(1 - (${sql.unsafe(column)} <=> ${vectorLiteral(query)}::vector))`;
}

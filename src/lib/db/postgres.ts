import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");

declare global {
  var __heirloomSql: ReturnType<typeof postgres> | undefined;
  var __heirloomSqlAdmin: ReturnType<typeof postgres> | undefined;
}

export const sql =
  globalThis.__heirloomSql ??
  postgres(url, {
    max: 8,
    idle_timeout: 30,
    connect_timeout: 10,
    transform: { undefined: null },
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
    max: 2,
    idle_timeout: 30,
    connect_timeout: 10,
    transform: { undefined: null },
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

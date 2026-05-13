import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}

declare global {
  // eslint-disable-next-line no-var
  var __heirloomSql: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
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

/**
 * Admin/superuser connection. **Use sparingly.** Only for trusted
 * server-side code that legitimately needs to read across RLS tables
 * before a session exists — bootstrap, magic-link/passphrase auth
 * discovery, and similar. Never to serve user requests directly.
 *
 * Routes that already have a session should always go through `sql` +
 * `withRls()` so RLS is the single source of truth for access control.
 */
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

/**
 * Run a callback inside a transaction with the per-request RLS GUCs set.
 *
 * Heirloom's row-level security policies read `app.user_id` and `app.role`
 * via `current_setting()`. The middleware that knows the principal must call
 * this wrapper so RLS gates apply on every query against tables with policies.
 */
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

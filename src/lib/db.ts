import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}

declare global {
  // eslint-disable-next-line no-var
  var __heirloomSql: ReturnType<typeof postgres> | undefined;
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
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.user_id', ${userId}, true)`;
    await tx`SELECT set_config('app.role', ${role}, true)`;
    return fn(tx);
  });
}

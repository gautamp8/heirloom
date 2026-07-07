import { execSync } from "node:child_process";

/**
 * Reset the dedicated E2E database and re-import the Sagan seed so every
 * run starts from the same archive. Skipped when E2E_BASE_URL points at
 * an external instance (that instance owns its own state).
 *
 * Needs: local postgres (the dev pg17 on :5433), Ollama with the local
 * models (embeddings for the seed import), psql on PATH.
 */
export default async function globalSetup() {
  if (process.env.E2E_BASE_URL) {
    console.log("[e2e-setup] external target, skipping DB reset");
    return;
  }

  const admin =
    process.env.E2E_DATABASE_ADMIN_URL ??
    "postgres://gautam_prajapati@localhost:5433/postgres";
  const dbUrl =
    process.env.E2E_DATABASE_URL ??
    "postgres://gautam_prajapati@localhost:5433/heirloom_e2e";
  const dbName = new URL(dbUrl).pathname.slice(1);

  const sh = (cmd: string) =>
    execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });

  console.log(`[e2e-setup] resetting ${dbName}`);
  sh(`psql "${admin}" -c "DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)"`);
  sh(`psql "${admin}" -c "CREATE DATABASE ${dbName}"`);
  sh(
    `psql "${dbUrl}" -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS \\"uuid-ossp\\"; CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pgcrypto;"`,
  );
  sh(`psql "${dbUrl}" -q -v ON_ERROR_STOP=0 -f design-system/handoff/SCHEMA.sql 2>/dev/null || true`);
  sh(
    `for m in migrations/*.sql; do psql "${dbUrl}" -q -v ON_ERROR_STOP=0 -f "$m" >/dev/null 2>&1; done`,
  );

  console.log("[e2e-setup] importing sagan seed");
  sh(
    `DATABASE_URL="${dbUrl}" DATABASE_ADMIN_URL="${dbUrl}" HEIRLOOM_BLOB_DIR=.e2e-blobs ` +
      `pnpm tsx desktop/scripts/import-seed-archive.ts ./desktop/seed-archives/sagan`,
  );
  console.log("[e2e-setup] done");
}

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/** Fixed sqlite artifacts for the E2E sqlite backend (E2E_BACKEND=sqlite).
 *  Shared verbatim with the webServer command in playwright.config.ts. */
export const E2E_SQLITE_PATH = path.resolve(".e2e-sqlite/heirloom.db");
export const E2E_SQLITE_BLOB_DIR = path.resolve(".e2e-blobs-sqlite");

/**
 * Reset the dedicated E2E database and re-import the Sagan seed so every
 * run starts from the same archive. Skipped when E2E_BASE_URL points at
 * an external instance (that instance owns its own state).
 *
 * Two backends, selected by E2E_BACKEND:
 *   - postgres (default): the dev pg17 on :5433, proving the server path.
 *   - sqlite: a throwaway file the desktop bundle's engine would use,
 *     proving the desktop path. The seed importer is backend-aware, so
 *     the same command imports into either.
 *
 * Needs: Ollama with the local models (embeddings for the seed import);
 * for postgres, the dev pg17 on :5433 and psql on PATH.
 */
export default async function globalSetup() {
  if (process.env.E2E_BASE_URL) {
    console.log("[e2e-setup] external target, skipping DB reset");
    return;
  }

  const sh = (cmd: string) =>
    execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });

  if (process.env.E2E_BACKEND === "sqlite") {
    // The sqlite file is reset + seeded inside the webServer command (see
    // playwright.config.ts) so it is ready before the health check, which
    // Playwright runs before this hook. Nothing to do here.
    console.log("[e2e-setup] sqlite backend — seeded by the webServer command");
    return;
  }

  const admin =
    process.env.E2E_DATABASE_ADMIN_URL ??
    "postgres://gautam_prajapati@localhost:5433/postgres";
  const dbUrl =
    process.env.E2E_DATABASE_URL ??
    "postgres://gautam_prajapati@localhost:5433/heirloom_e2e";
  const dbName = new URL(dbUrl).pathname.slice(1);

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

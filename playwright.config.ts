import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite. Targets a live dev server on a DEDICATED database — global
 * setup resets `heirloom_e2e` (postgres) and re-imports the Sagan seed,
 * so specs start from a known archive every run.
 *
 *   pnpm test:e2e            # starts its own server on :3100
 *   E2E_BASE_URL=...         # target an already-running instance instead
 *
 * Local inference makes reflection slow; budgets are generous and the
 * suite runs serially against one Ollama.
 */
const E2E_PORT = 3100;
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${E2E_PORT}`;

// E2E_BACKEND=sqlite runs the same suite against the desktop engine.
// Paths must match tests/e2e/global-setup.ts.
const SQLITE = process.env.E2E_BACKEND === "sqlite";
const path = require("node:path") as typeof import("node:path");
const E2E_SQLITE_PATH = path.resolve(".e2e-sqlite/heirloom.db");
const E2E_SQLITE_BLOB_DIR = path.resolve(".e2e-blobs-sqlite");

// For sqlite, seed the throwaway file inside the webServer command — right
// before next dev serves it — because Playwright brings the webServer up
// and health-checks it before globalSetup runs, and the health check is
// 503 until the DB has an archive. Seeding here makes it order-independent.
const sqliteSeed =
  `rm -rf "${path.dirname(E2E_SQLITE_PATH)}" "${E2E_SQLITE_BLOB_DIR}" && ` +
  `mkdir -p "${path.dirname(E2E_SQLITE_PATH)}" "${E2E_SQLITE_BLOB_DIR}" && ` +
  `HEIRLOOM_BACKEND=sqlite HEIRLOOM_SQLITE_PATH="${E2E_SQLITE_PATH}" ` +
  `HEIRLOOM_BLOB_DIR="${E2E_SQLITE_BLOB_DIR}" ` +
  `pnpm tsx desktop/scripts/import-seed-archive.ts ./desktop/seed-archives/sagan`;

const webServerCommand = SQLITE
  ? `${sqliteSeed} && HEIRLOOM_BACKEND=sqlite HEIRLOOM_SQLITE_PATH="${E2E_SQLITE_PATH}" ` +
    `HEIRLOOM_BLOB_DIR="${E2E_SQLITE_BLOB_DIR}" pnpm exec next dev -p ${E2E_PORT}`
  : `DATABASE_URL=$E2E_DATABASE_URL DATABASE_ADMIN_URL=$E2E_DATABASE_URL ` +
    `HEIRLOOM_BLOB_DIR=.e2e-blobs pnpm exec next dev -p ${E2E_PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: webServerCommand,
        url: `http://127.0.0.1:${E2E_PORT}/api/health`,
        reuseExistingServer: true,
        timeout: SQLITE ? 240_000 : 60_000,
        env: {
          E2E_DATABASE_URL:
            process.env.E2E_DATABASE_URL ??
            "postgres://gautam_prajapati@localhost:5433/heirloom_e2e",
        },
      },
});

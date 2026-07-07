import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    // Each file runs in its own forked process so tests can pick a DB
    // backend via env (HEIRLOOM_BACKEND / HEIRLOOM_SQLITE_PATH) before
    // importing src/lib/db, whose backend choice is frozen at import time.
    pool: "forks",
    include: ["tests/unit/**/*.test.ts"],
    testTimeout: 20_000,
  },
});

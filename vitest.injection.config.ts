import { defineConfig } from "vitest/config";
import path from "node:path";

/** Injection harness config: integration tests against a live instance
 *  (TEST_BASE_URL, default http://127.0.0.1:3000). Sequential — local
 *  inference can't take parallel synthesis, and the demo host shouldn't
 *  have to. */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["tests/prompt-injection/**/*.test.ts"],
    fileParallelism: false,
    maxConcurrency: 1,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});

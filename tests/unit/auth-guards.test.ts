// auth.ts imports ./db, whose backend dispatcher uses an extensionless
// CJS require("./sqlite") that native Node under vitest can't resolve;
// tsx's CJS hook teaches require() to compile TypeScript.
import "tsx/cjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The production JWT hard-fail (src/lib/auth.ts). auth.ts throws at module
 * load, so each case sets env, then dynamic-imports a fresh copy with the
 * module cache busted by a unique query suffix.
 */
const DEV_FALLBACK = "dev-only-rotate-in-prod-this-string-is-not-a-real-secret-32b";

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    HEIRLOOM_BACKEND: process.env.HEIRLOOM_BACKEND,
  };
  // Avoid pulling in the postgres backend (needs DATABASE_URL) — auth.ts
  // imports ./db, which the sqlite backend satisfies without a server.
  process.env.HEIRLOOM_BACKEND = "sqlite";
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function loadAuth(tag: string) {
  return import(`@/lib/auth?bust=${tag}`);
}

describe("JWT secret production guard", () => {
  it("throws in production when JWT_SECRET is unset", async () => {
    // @ts-expect-error NODE_ENV is normally readonly in types
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    await expect(loadAuth("unset")).rejects.toThrow(/JWT_SECRET must be set/);
  });

  it("throws in production when JWT_SECRET is the public fallback", async () => {
    // @ts-expect-error NODE_ENV is normally readonly in types
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = DEV_FALLBACK;
    await expect(loadAuth("fallback")).rejects.toThrow(/JWT_SECRET must be set/);
  });

  it("boots in production with a real secret", async () => {
    // @ts-expect-error NODE_ENV is normally readonly in types
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "a-genuinely-random-production-secret-value-here";
    const auth = await loadAuth("real");
    expect(typeof auth.issueSession).toBe("function");
  });

  it("boots in development without a secret (dev fallback allowed)", async () => {
    // @ts-expect-error NODE_ENV is normally readonly in types
    process.env.NODE_ENV = "development";
    delete process.env.JWT_SECRET;
    const auth = await loadAuth("dev");
    expect(typeof auth.issueSession).toBe("function");
  });
});

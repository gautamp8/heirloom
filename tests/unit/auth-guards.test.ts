// auth.ts imports ./db, whose backend dispatcher uses an extensionless
// CJS require("./sqlite") that native Node under vitest can't resolve;
// tsx's CJS hook teaches require() to compile TypeScript.
import "tsx/cjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The production JWT hard-fail (src/lib/auth.ts). auth.ts throws at module
 * load, so each case sets env, then dynamic-imports a fresh copy with the
 * module cache busted by a unique query suffix.
 *
 * The guard applies to the SERVER build (postgres backend). The desktop
 * build (sqlite, single-user, on-device) is exempt — see the last case.
 */
const DEV_FALLBACK = "dev-only-rotate-in-prod-this-string-is-not-a-real-secret-32b";

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    HEIRLOOM_BACKEND: process.env.HEIRLOOM_BACKEND,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  // The server path: the postgres backend module only needs DATABASE_URL
  // present at import time (it doesn't connect until a query runs), so a
  // dummy value lets auth.ts load its ./db import without a real server.
  delete process.env.HEIRLOOM_BACKEND;
  process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/dummy";
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

describe("JWT secret production guard (server build)", () => {
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

  it("exempts the desktop build (sqlite backend) — no secret needed", async () => {
    // The packaged app runs NODE_ENV=production with no JWT_SECRET; it must
    // still boot, since it's single-user on the owner's own device.
    // @ts-expect-error NODE_ENV is normally readonly in types
    process.env.NODE_ENV = "production";
    process.env.HEIRLOOM_BACKEND = "sqlite";
    delete process.env.JWT_SECRET;
    const auth = await loadAuth("desktop");
    expect(typeof auth.issueSession).toBe("function");
  });
});

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { signOut } from "./helpers";

const E2E_DB_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://gautam_prajapati@localhost:5433/heirloom_e2e";

/** The exact shape generatePassphrase() emits: `willow · bread · river · 14`. */
const PASSPHRASE_RE = /^[a-z]+ · [a-z]+ · [a-z]+ · \d{2}$/;

/** Error copy, verbatim from src/app/executor/unlock/form.tsx. */
const WRONG_CREDENTIALS_COPY =
  "That isn't the right passphrase, or the creator's email hint doesn't match. Try again.";
const RATE_LIMIT_COPY = "Too many attempts. Wait an hour and try again.";

/**
 * The unlock route rate-limits by `x-forwarded-for` (in-memory Map that
 * persists in the dev server across specs and runs; Next only fills the
 * header in when absent, so a client-supplied value wins). Giving every
 * unlock interaction its own synthetic IP keeps this spec deterministic
 * against earlier attempts AND keeps our failed attempts from exhausting
 * the shared bucket for other specs.
 */
let ipSerial = 0;
function syntheticIp(): string {
  return `10.99.${Date.now() % 251}.${++ipSerial}`;
}

/** Short-lived DB connection for direct setup/assertions. */
async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(E2E_DB_URL, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/**
 * Mint a fresh creator + vault through the real bootstrap endpoint. Each
 * test runs in a clean browser context (no session cookie), so this always
 * creates a brand-new vault with a unique `<uuid>@creator.heirloom.local`
 * email — which doubles as a collision-proof hint for /executor/unlock.
 */
async function bootstrapCreator(page: Page) {
  const r = await page.request.post("/api/dev/bootstrap");
  expect(r.ok()).toBeTruthy();
  const data = (await r.json()) as {
    user: { id: string; email: string };
    vault_id: string;
  };
  return { email: data.user.email, vault_id: data.vault_id };
}

/** /api/executor/setup refuses until the vault has a nominee; there is no
 *  nominee-designation UI wired into this flow yet, so insert directly. */
async function designateNominee(sql: postgres.Sql, vaultId: string) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO nominees (vault_id, name, relationship, email, role)
    VALUES (${vaultId}, 'Ada', 'Daughter', 'ada@executor.e2e', 'executor')
    RETURNING id
  `;
  return row.id;
}

test.describe("executor passphrase", () => {
  test("creator generates the passphrase, executor releases the archive", async ({
    page,
  }) => {
    const creator = await bootstrapCreator(page);

    // Seed one unreleased piece on the fresh vault so the unlock has
    // something to flip (a thread release — no capture pipeline needed).
    const { nomineeId, releaseId } = await withDb(async (sql) => {
      const nomineeId = await designateNominee(sql, creator.vault_id);
      const [thread] = await sql<{ id: string }[]>`
        INSERT INTO threads (vault_id, title)
        VALUES (${creator.vault_id}, 'For Ada')
        RETURNING id
      `;
      const [release] = await sql<{ id: string }[]>`
        INSERT INTO nominee_releases (nominee_id, vault_id, thread_id, trigger, label)
        VALUES (${nomineeId}, ${creator.vault_id}, ${thread.id}, 'scheduled',
                'e2e executor release')
        RETURNING id
      `;
      return { nomineeId, releaseId: release.id };
    });
    expect(nomineeId).toBeTruthy();

    // 1. Generate the executor passphrase.
    await page.goto("/executor/setup");
    await expect(
      page.getByRole("heading", { name: /Who can open this if you can/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Generate a passphrase" }).click();

    // argon2id at 64 MiB plus first-compile of the route on next dev.
    await expect(
      page.getByText("This passphrase is shown only once"),
    ).toBeVisible({ timeout: 60_000 });

    const phraseEl = page.locator("p", { hasText: PASSPHRASE_RE });
    await expect(phraseEl).toBeVisible();
    const passphrase = ((await phraseEl.textContent()) ?? "").trim();
    expect(passphrase).toMatch(PASSPHRASE_RE);

    // The printable letter carries the same passphrase.
    await expect(page.getByText("The letter to print")).toBeVisible();
    await expect(page.locator("pre")).toContainText(passphrase);

    // 2. The executor is, by definition, not signed in.
    await signOut(page);
    await page.setExtraHTTPHeaders({ "x-forwarded-for": syntheticIp() });
    await page.goto("/executor/unlock");
    await expect(
      page.getByRole("heading", { name: "You were trusted with this." }),
    ).toBeVisible();

    await page.getByLabel(/creator.s email/i).fill(creator.email);
    await page.getByLabel("The passphrase").fill(passphrase);
    await page.getByRole("button", { name: "Release the archive" }).click();

    // 3. Success state reports exactly our one flipped piece.
    await expect(page.getByText(/It.s done\./)).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByText(
        "1 piece has been released to the nominees. They can open the archive whenever they're ready.",
      ),
    ).toBeVisible();

    // And the DB agrees: released_at flipped, nothing left unreleased,
    // the credential is marked used.
    await withDb(async (sql) => {
      const [release] = await sql<{ released_at: string | null }[]>`
        SELECT released_at FROM nominee_releases WHERE id = ${releaseId}
      `;
      expect(release.released_at).not.toBeNull();

      const [pending] = await sql<{ n: number }[]>`
        SELECT CAST(COUNT(*) AS INTEGER) AS n FROM nominee_releases
        WHERE vault_id = ${creator.vault_id} AND released_at IS NULL
      `;
      expect(pending.n).toBe(0);

      const [cred] = await sql<{ used_at: string | null }[]>`
        SELECT used_at FROM executor_credentials
        WHERE vault_id = ${creator.vault_id}
      `;
      expect(cred.used_at).not.toBeNull();
    });
  });

  test("wrong passphrase shows the error and releases nothing", async ({
    page,
  }) => {
    const creator = await bootstrapCreator(page);
    await withDb((sql) => designateNominee(sql, creator.vault_id));

    // Provision a real credential; the plaintext is discarded on purpose.
    const r = await page.request.post("/api/executor/setup", { data: {} });
    expect(r.ok()).toBeTruthy();

    await signOut(page);
    await page.setExtraHTTPHeaders({ "x-forwarded-for": syntheticIp() });
    await page.goto("/executor/unlock");

    await page.getByLabel(/creator.s email/i).fill(creator.email);
    // Normalises to "not the phrase 00" — never a generated passphrase.
    await page.getByLabel("The passphrase").fill("not · the · phrase · 00");
    await page.getByRole("button", { name: "Release the archive" }).click();

    await expect(page.getByText(WRONG_CREDENTIALS_COPY)).toBeVisible({
      timeout: 60_000,
    });
    // Still sealed: the form is on screen and the credential is unused.
    await expect(
      page.getByRole("button", { name: "Release the archive" }),
    ).toBeVisible();
    await withDb(async (sql) => {
      const [cred] = await sql<{ used_at: string | null }[]>`
        SELECT used_at FROM executor_credentials
        WHERE vault_id = ${creator.vault_id}
      `;
      expect(cred.used_at).toBeNull();
    });
  });

  // LAST on purpose: this test deliberately exhausts a rate-limit bucket.
  // The bucket is namespaced to a throwaway synthetic IP, so nothing else
  // in the run (or a later run against a reused dev server) is affected.
  test("five failed attempts rate-limit the next one", async ({ page }) => {
    const ip = syntheticIp();

    // Prime the limiter: five wrong attempts from the same address.
    // Nonexistent hint — no real vault's credential ever gets attempted.
    for (let i = 0; i < 5; i++) {
      const r = await page.request.post("/api/executor/unlock", {
        headers: { "x-forwarded-for": ip },
        data: {
          vault_email_hint: `nobody-${ip}`,
          passphrase: "not · the · phrase · 00",
        },
      });
      expect(r.status()).toBe(401);
    }

    // The sixth attempt, through the real form, hits the 429 copy.
    await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await page.goto("/executor/unlock");
    await page.getByLabel(/creator.s email/i).fill(`nobody-${ip}`);
    await page.getByLabel("The passphrase").fill("not · the · phrase · 00");
    await page.getByRole("button", { name: "Release the archive" }).click();

    await expect(page.getByText(RATE_LIMIT_COPY)).toBeVisible({
      timeout: 60_000,
    });
  });
});

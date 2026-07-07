import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { signInAsCreator, signOut } from "./helpers";

/**
 * Vault export / import round-trip.
 *
 * 1. A creator exports their archive from Settings → Vault as an
 *    encrypted .hloom bundle (argon2id + ChaCha20-Poly1305).
 * 2. A signed-out visitor restores that bundle through the portal's
 *    "Import an existing archive" path, which mints a brand-new
 *    creator + vault and reveals a fresh archive key.
 * 3. A wrong passphrase is refused with the portal's unlock error.
 *
 * Serial: tests 2 and 3 replay the bundle produced in test 1.
 */

const EXPORT_PASSPHRASE = "orchard-lantern-77";

// Unique per run so the assertion can't latch onto residue from other
// specs sharing the serial suite's database.
const RUN_TAG = Date.now().toString(36);
const NOTE_TITLE = `Lighthouse ledger ${RUN_TAG}`;
const NOTE_BODY =
  "The lighthouse keeper kept a brass ledger of every ship that passed " +
  "the point, and we would read the older entries together on the porch " +
  `after supper. (${RUN_TAG})`;

let bundlePath: string;

/**
 * Block until the capture pipeline reports ready. The status route is
 * SSE and closes on ready/failed or after its 60 s safety net, so we
 * just re-open it until a terminal event shows up. Local inference is
 * slow; the budget is generous.
 */
async function waitForCaptureReady(
  page: Page,
  captureId: string,
  budgetMs = 240_000,
) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const r = await page.request.get(`/api/capture/${captureId}/status`, {
      timeout: 90_000,
    });
    const body = await r.text();
    if (body.includes("event: ready")) return;
    if (body.includes("Pipeline failed")) {
      throw new Error(`capture ${captureId} pipeline failed`);
    }
    // "timeout" safety-net event → pipeline still running; poll again.
  }
  throw new Error(`capture ${captureId} not ready within ${budgetMs}ms`);
}

test.describe.serial("vault export / import", () => {
  test("creator exports an encrypted .hloom bundle from Settings", async ({
    page,
  }) => {
    test.setTimeout(360_000);
    await signInAsCreator(page);

    // Give the fresh vault one distinctive capture so the bundle has
    // recognisable content to assert on after import.
    const r = await page.request.post("/api/capture", {
      data: { kind: "note", body: NOTE_BODY, title: NOTE_TITLE },
    });
    expect(r.status()).toBe(202);
    const { capture_id } = (await r.json()) as { capture_id: string };
    await waitForCaptureReady(page, capture_id);

    await page.goto("/settings");
    await page.getByPlaceholder("six words is plenty").fill(EXPORT_PASSPHRASE);

    const downloadPromise = page.waitForEvent("download", {
      timeout: 120_000,
    });
    await page.getByRole("button", { name: "Export bundle" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.hloom$/);

    bundlePath = test.info().outputPath("exported.hloom");
    await download.saveAs(bundlePath);

    await expect(
      page.getByText("Keep the passphrase somewhere safe"),
    ).toBeVisible();

    // The bundle is a JSON envelope wrapping real ciphertext.
    expect(fs.statSync(bundlePath).size).toBeGreaterThan(1024);
    const envelope = JSON.parse(fs.readFileSync(bundlePath, "utf8")) as {
      magic: string;
      ciphertext: string;
      meta?: { counts?: { captures?: number } };
    };
    expect(envelope.magic).toBe("HLOOM");
    expect(envelope.ciphertext.length).toBeGreaterThan(0);
    expect(envelope.meta?.counts?.captures ?? 0).toBeGreaterThanOrEqual(1);
  });

  test("portal import mints a new archive and reveals a fresh key", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await signOut(page);

    await page.goto("/portal");
    await page
      .getByRole("button", { name: "Import an existing archive" })
      .click();
    await page.locator('input[type="file"]').setInputFiles(bundlePath);
    await expect(
      page.getByRole("button", { name: "exported.hloom" }),
    ).toBeVisible();
    await page.getByPlaceholder("Bundle passphrase").fill(EXPORT_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock and import" }).click();

    // argon2id key derivation + full row replay; generous.
    await expect(page.getByText("Your archive key")).toBeVisible({
      timeout: 180_000,
    });
    // The freshly issued creator passphrase, e.g. "willow · bread · river · 14".
    await expect(
      page.getByText(/^[a-z]+ · [a-z]+ · [a-z]+ · \d{2}$/),
    ).toBeVisible();

    await page.getByRole("button", { name: /written it down/ }).click();
    await page.waitForURL("**/");

    // The imported vault is marked onboarded, so home renders the
    // restored capture straight away.
    await expect(page.getByText(NOTE_TITLE)).toBeVisible({ timeout: 60_000 });
  });

  test("wrong passphrase on import is refused", async ({ page }) => {
    await page.goto("/portal");
    await page
      .getByRole("button", { name: "Import an existing archive" })
      .click();
    await page.locator('input[type="file"]').setInputFiles(bundlePath);
    await page
      .getByPlaceholder("Bundle passphrase")
      .fill("not-the-right-words");
    await page.getByRole("button", { name: "Unlock and import" }).click();

    await expect(
      page.getByText("Couldn't unlock the bundle. Check the passphrase."),
    ).toBeVisible({ timeout: 120_000 });
  });
});

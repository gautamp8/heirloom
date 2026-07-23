import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { signInAsCreator, signInAsNominee } from "./helpers";

const E2E_DB_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://gautam_prajapati@localhost:5433/heirloom_e2e";

/** Exact eyebrow (h2) heading per settings section, creator view. */
const CREATOR_SECTIONS = [
  "You",
  "Important dates",
  "Nominees",
  "Your voice",
  "Your photo",
  "Your archive key",
  "Notifications",
  "Language model",
  "Vault",
  "Session", // the sign-out section
] as const;

/** Nominee settings is the reduced set; everything else must be absent. */
const NOMINEE_SECTIONS = ["You", "Notifications", "Session"] as const;
const CREATOR_ONLY_SECTIONS = CREATOR_SECTIONS.filter(
  (s) => !(NOMINEE_SECTIONS as readonly string[]).includes(s),
);

/** `eyebrow` headings are case-transformed by CSS; match the exact JSX
 *  string (accessible names ignore text-transform in Chromium here, and
 *  getByRole name matching is case-insensitive by default anyway). */
function sectionHeading(page: Page, name: string) {
  return page.getByRole("heading", { name, exact: true });
}

test.describe("welcome ceremony", () => {
  // ?stage= freezes the flow at one animation frame with the built-in
  // Rita → Sam fixture letter (no session needed). Each frozen stage
  // gets a visual record in test-results/.
  const FROZEN_STAGES = ["opening", "emerging", "unfolding", "reading"] as const;

  for (const stage of FROZEN_STAGES) {
    test(`frozen ?stage=${stage} renders the Rita → Sam fixture`, async ({
      page,
    }) => {
      await page.goto(`/welcome?stage=${stage}`);

      // The page shell mounted.
      await expect(
        page.getByText("Local-first · Nothing leaves without you"),
      ).toBeVisible();

      // A frozen stage is never the sealed-envelope form.
      await expect(
        page.getByPlaceholder("the words you were told"),
      ).toHaveCount(0);

      if (stage === "reading") {
        // Envelope is gone; the fixture letter is open and readable.
        await expect(page.getByText("From Rita · For Sam")).toBeVisible();
        await expect(
          page.getByText("Sam — there is something here for you.", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(page.getByText("Take your time with this.")).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Enter the archive" }),
        ).toBeVisible();
      } else {
        // Envelope stages carry the folded fixture letter (a ~90-char
        // excerpt of the body) inside the paper.
        await expect(
          page.getByText(/Sam — there is something here for you/),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Enter the archive" }),
        ).toHaveCount(0);
      }

      // Let the freeze-frame settle (flap/letter transitions run to the
      // frozen pose; the "Enter" button fades in after 1.2s) so the
      // screenshot shows the finished frame, not a transition.
      await page.waitForTimeout(2_000);
      await page.screenshot({ path: `test-results/welcome-${stage}.png` });
    });
  }

  test("wrong passphrase shows the error and keeps the envelope sealed", async ({
    page,
  }) => {
    await page.goto("/welcome");

    const input = page.getByPlaceholder("the words you were told");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("not the right phrase");
    await page.getByRole("button", { name: "Open", exact: true }).click();

    await expect(
      page.getByText(
        "That isn\u2019t the right passphrase. Try again, or ask the person who shared it with you.",
      ),
    ).toBeVisible();

    // Still sealed: the passphrase form stays on screen, nothing opened.
    await expect(input).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enter the archive" }),
    ).toHaveCount(0);
  });
});

test.describe("notifications API", () => {
  test("subscribe stores the push subscription, unsubscribe removes it", async ({
    page,
  }) => {
    await signInAsNominee(page);

    // No real push service in headless — exercise the API contract with a
    // synthetic subscription via the session-carrying request context.
    const endpoint = "https://example.com/push/x";
    const p256dh = "BAe2eSyntheticP256dhKey";
    const auth = "dGVzdA";

    const r = await page.request.post("/api/notifications/subscribe", {
      data: { subscription: { endpoint, keys: { p256dh, auth } } },
    });
    expect(r.ok()).toBeTruthy();
    const body = (await r.json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe("string");

    const sql = postgres(E2E_DB_URL, { max: 1 });
    try {
      // The row landed with the exact keys we sent.
      const rows = await sql<
        { id: string; p256dh: string; auth: string }[]
      >`SELECT id, p256dh, auth FROM push_subscriptions WHERE endpoint = ${endpoint}`;
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(body.id);
      expect(rows[0].p256dh).toBe(p256dh);
      expect(rows[0].auth).toBe(auth);

      // Malformed subscription (missing keys) is rejected outright.
      const bad = await page.request.post("/api/notifications/subscribe", {
        data: { subscription: { endpoint: "https://example.com/push/bad" } },
      });
      expect(bad.status()).toBe(400);

      // Unsubscribe removes the row.
      const u = await page.request.post("/api/notifications/unsubscribe", {
        data: { endpoint },
      });
      expect(u.ok()).toBeTruthy();
      const after = await sql`
        SELECT 1 FROM push_subscriptions WHERE endpoint = ${endpoint}
      `;
      expect(after).toHaveLength(0);
    } finally {
      await sql.end();
    }
  });
});

test.describe("settings", () => {
  test("creator settings shows every section", async ({ page }) => {
    await signInAsCreator(page);
    await page.goto("/settings");

    await expect(
      page.getByRole("heading", { name: "Care for the archive." }),
    ).toBeVisible();

    for (const name of CREATOR_SECTIONS) {
      await expect(sectionHeading(page, name)).toBeVisible();
    }
  });

  test("nominee settings shows the reduced set", async ({ page }) => {
    await signInAsNominee(page);
    await page.goto("/settings");

    await expect(
      page.getByRole("heading", { name: "Care for the archive." }),
    ).toBeVisible();

    for (const name of NOMINEE_SECTIONS) {
      await expect(sectionHeading(page, name)).toBeVisible();
    }
    // Nominee framing copy renders (stable regardless of seed names).
    await expect(
      page.getByText("Everything you see here was prepared for you"),
    ).toBeVisible();

    // None of the creator-only sections leak into the nominee view.
    for (const name of CREATOR_ONLY_SECTIONS) {
      await expect(sectionHeading(page, name)).toHaveCount(0);
    }
  });
});

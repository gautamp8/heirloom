import { expect, test } from "@playwright/test";
import { signInAsNominee } from "./helpers";

// The UI renders this with a typographic apostrophe (&rsquo;), so match
// on the distinctive apostrophe-free middle rather than the exact string.
const EMPTY_STATE = /have that in the archive\. Try asking another way/i;

test.describe("reflection", () => {
  test("grounded question answers and cites the source", async ({ page }) => {
    await signInAsNominee(page);
    await page.goto("/reflect");

    await page
      .getByRole("textbox", { name: "What are you looking for?" })
      .fill("What did you write about the pale blue dot?");
    await page.getByRole("button", { name: "Ask" }).click();

    // Local synthesis is slow; the citation strip ("Drawn from N …") is
    // the done signal for a grounded answer.
    await expect(page.getByText(/drawn from/i)).toBeVisible({
      timeout: 180_000,
    });
    await expect(page.getByText(EMPTY_STATE)).not.toBeVisible();

    // The answer names the topic it grounded on (the model retells, it
    // doesn't reproduce, so match a stable content word, not a quote).
    await expect(page.getByText(/pale blue dot|earth|dot/i).first()).toBeVisible();

    // A citation is present. Non-photo captures render as text chips,
    // photos as thumbnails — accept either as proof the answer is cited.
    const chip = page.getByRole("button", { name: /written note|voice note|capture/i });
    const photoThumb = page.locator("img[alt*='citation'], button:has(img)");
    await expect(chip.or(photoThumb).first()).toBeVisible();
  });

  test("fabrication bait refuses verbatim and lands in /transparency", async ({
    page,
  }) => {
    await signInAsNominee(page);
    // A zero-overlap topic reliably refuses pre-model (the retrieval floor
    // catches it without calling synthesis). "Antarctica" would lexically
    // hit the Apollo note and ground-then-decline — see the grounding eval.
    const bait = "What was his favorite poem?";
    await page.goto("/reflect");
    await page
      .getByRole("textbox", { name: "What are you looking for?" })
      .fill(bait);
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.getByText(EMPTY_STATE)).toBeVisible({
      timeout: 180_000,
    });

    await page.goto("/transparency");
    const row = page.locator("li", { hasText: bait }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText("Refused")).toBeVisible();
  });
});

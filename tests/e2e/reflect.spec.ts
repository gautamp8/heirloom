import { expect, test } from "@playwright/test";
import { signInAsNominee } from "./helpers";

const EMPTY_STATE = "I don't have that in the archive. Try asking another way?";

test.describe("reflection", () => {
  test("grounded question answers with citation chips", async ({ page }) => {
    await signInAsNominee(page);
    await page.goto("/reflect");

    await page
      .getByRole("textbox", { name: "What are you looking for?" })
      .fill("What did you write about the pale blue dot?");
    await page.getByRole("button", { name: "Ask" }).click();

    // Local synthesis is slow; the citation strip is the done signal.
    await expect(page.getByText("DRAWN FROM")).toBeVisible({
      timeout: 180_000,
    });
    await expect(page.getByText(EMPTY_STATE)).not.toBeVisible();

    // At least one citation chip, and it opens the source drawer.
    const chip = page.getByRole("button", { name: /WRITTEN NOTE|VOICE|PHOTO/ });
    await expect(chip.first()).toBeVisible();
    await chip.first().click();
    await expect(page.getByText(/pale blue dot/i).first()).toBeVisible();
  });

  test("fabrication bait refuses verbatim and lands in /transparency", async ({
    page,
  }) => {
    await signInAsNominee(page);
    const bait = "What did Carl say about his time in Antarctica?";
    await page.goto("/reflect");
    await page
      .getByRole("textbox", { name: "What are you looking for?" })
      .fill(bait);
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.getByText(EMPTY_STATE)).toBeVisible({
      timeout: 180_000,
    });

    await page.goto("/transparency");
    const row = page
      .locator("li", { hasText: bait })
      .first();
    await expect(row).toBeVisible();
    await expect(row.getByText("Refused")).toBeVisible();
  });
});

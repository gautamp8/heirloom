import { expect, type Page } from "@playwright/test";

export const SAGAN_URL_PASSPHRASE = "carl-sagan-archive-1990";

/** Sign in as the Sagan nominee through the real welcome ceremony. */
export async function signInAsNominee(page: Page) {
  await page.goto(`/welcome?p=${SAGAN_URL_PASSPHRASE}`);
  await expect(
    page.getByRole("button", { name: "Enter the archive" }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Enter the archive" }).click();
  await page.waitForURL("**/");
}

/** Sign in as the (dev-bootstrapped) creator. */
export async function signInAsCreator(page: Page) {
  const r = await page.request.post("/api/dev/bootstrap");
  expect(r.ok()).toBeTruthy();
  await page.goto("/");
}

export async function signOut(page: Page) {
  await page.request.post("/api/auth/sign-out");
}

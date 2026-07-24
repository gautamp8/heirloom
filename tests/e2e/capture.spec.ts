import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { e2eDb } from "./db";
import { signInAsCreator } from "./helpers";

/**
 * Guided capture, creator side: note / photo / voice through the real
 * capture sheet, plus the honestly-disabled video chip.
 *
 * Every test bootstraps a FRESH creator (each `/api/dev/bootstrap`
 * without a session mints a new user + empty vault), so the Recent
 * list starts empty and nothing here depends on earlier specs.
 *
 * The capture status stream (`/api/capture/[id]/status`) has a 60 s
 * server-side safety window. Local inference can outlast it — the
 * pipeline keeps running in the DB while the sheet stops hearing
 * events — so the ready-wait falls back to polling the row directly
 * and reloading Home (see waitForCaptureReady).
 */


const SEED_PHOTO = path.resolve(
  __dirname,
  "../../desktop/seed-archives/sagan/photos/golden-record.jpg",
);

const NOTE_BODY =
  "The lighthouse summer of 1974. We spent June at the Point Reyes " +
  "lighthouse, counting gray whales from the gallery rail and drying " +
  "kelp on the fence posts. My grandmother taught me to read the fog " +
  "horn intervals the way other people read a clock.";

/** Fresh creator + mark the vault onboarded through the real API so
 *  Home renders instead of redirecting to /onboarding (the welcome
 *  flow is its own journey, not this spec's). The complete call builds
 *  the identity index via Ollama embeddings, so it gets a wide budget. */
async function signInAsOnboardedCreator(page: Page) {
  await signInAsCreator(page);
  const r = await page.request.post("/api/onboarding/complete", {
    timeout: 180_000,
  });
  expect(r.ok()).toBeTruthy();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible({ timeout: 30_000 });
}

/** Trigger the save and return the capture_id from the 202 response. */
async function saveAndCaptureId(
  page: Page,
  trigger: () => Promise<void>,
): Promise<string> {
  const respPromise = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === "/api/capture",
    { timeout: 60_000 },
  );
  await trigger();
  const resp = await respPromise;
  expect(resp.status(), "capture upload accepted").toBe(202);
  const { capture_id } = (await resp.json()) as { capture_id: string };
  expect(capture_id).toBeTruthy();
  return capture_id;
}

/** Wait for a capture's pipeline to finish, within `budgetMs`.
 *
 * Primary signal: Home closes the capture sheet when the status stream
 * reports `ready`. If the stream's 60 s server window lapses first
 * (slow local inference), the sheet hangs while the pipeline keeps
 * going — so past ~75 s we poll the captures row directly and reload
 * Home so the assertions that follow read server-rendered state.
 * Fails loudly if the pipeline lands on `failed`. */
async function waitForCaptureReady(
  page: Page,
  captureId: string,
  budgetMs: number,
) {
  const deadline = Date.now() + budgetMs;
  const sheet = page.getByRole("dialog");
  try {
    await sheet.waitFor({
      state: "hidden",
      timeout: Math.min(75_000, budgetMs),
    });
    return; // SSE `ready` arrived; Home prepended the row itself.
  } catch {
    /* stream window likely lapsed — fall back to the DB */
  }

  const { sql, end } = e2eDb();
  try {
    for (;;) {
      const [row] = await sql<{ status: string }[]>`
        SELECT status FROM captures WHERE id = ${captureId}
      `;
      if (row?.status === "ready") break;
      if (!row || row.status === "failed") {
        throw new Error(
          `capture ${captureId}: pipeline ${row ? "failed" : "row missing"}`,
        );
      }
      if (Date.now() > deadline) {
        throw new Error(
          `capture ${captureId} still '${row.status}' after ${budgetMs} ms`,
        );
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
  } finally {
    await end();
  }
  // Ready per the DB but the sheet never heard it — reload Home so the
  // Recent list reflects the finished capture.
  await page.goto("/");
}

test.describe("guided capture (creator)", () => {
  test("typed note runs the pipeline and lands in Recent", async ({ page }) => {
    test.setTimeout(300_000);
    await signInAsOnboardedCreator(page);

    await page.getByRole("button", { name: "Note Typed lines" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Write a memory")).toBeVisible();

    // Free-form note (chip carries no prompt), so the title is editable.
    await sheet.getByLabel("Title").fill("The lighthouse summer");
    await sheet.getByPlaceholder("Take your time").fill(NOTE_BODY);

    const captureId = await saveAndCaptureId(page, () =>
      sheet.getByRole("button", { name: "Save to vault" }).click(),
    );

    // Pipeline stage copy surfaces in the sheet while the SSE runs.
    await expect(
      sheet
        .getByText(
          /Saving your words|Reading what you wrote|Tracing the threads|Saved\. This is the beginning\./,
        )
        .first(),
    ).toBeVisible();

    await waitForCaptureReady(page, captureId, 180_000);

    const row = page
      .locator("li", { hasText: "lighthouse summer of 1974" })
      .first();
    await expect(row).toBeVisible();
    await expect(row.getByText("The lighthouse summer", { exact: true })).toBeVisible();
    await expect(row.getByText(/failed|processing/)).toHaveCount(0);
  });

  test("photo upload is captioned and lands in Recent", async ({ page }) => {
    test.setTimeout(420_000);
    await signInAsOnboardedCreator(page);

    await page.getByRole("button", { name: "Photo With caption" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Hold a photograph")).toBeVisible();

    await sheet.locator('input[type="file"]').setInputFiles(SEED_PHOTO);
    await expect(
      sheet.getByRole("img", { name: "Selected photograph" }),
    ).toBeVisible();
    // Let the client-side face scan settle before committing.
    await expect(sheet.getByText(/faces? detected/)).toBeVisible({
      timeout: 90_000,
    });
    await sheet.getByLabel("Title").fill("Voyager golden record");

    const captureId = await saveAndCaptureId(page, () =>
      sheet.getByRole("button", { name: "Save to vault" }).click(),
    );

    await expect(
      sheet
        .getByText(
          /Holding the photograph|Looking at the photograph|Tracing the threads|Almost there|Saved\. This is the beginning\./,
        )
        .first(),
    ).toBeVisible();

    // Vision captioning on local inference is the slowest stage.
    await waitForCaptureReady(page, captureId, 240_000);

    const row = page
      .locator("li", { hasText: "Voyager golden record" })
      .first();
    await expect(row).toBeVisible();
    await expect(
      row.getByRole("img", { name: "Voyager golden record" }),
    ).toBeVisible();
    await expect(row.getByText(/failed|processing/)).toHaveCount(0);
  });

  test("voice recording lands without error", async ({ page }) => {
    test.setTimeout(360_000);
    await signInAsOnboardedCreator(page);

    await page.getByRole("button", { name: "Voice A recording" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Speak a memory")).toBeVisible();

    // The record/stop control now carries a real accessible name, so
    // address it by role rather than by its border-radius class.
    const recordButton = sheet.getByRole("button", {
      name: /start recording|stop recording/i,
    });
    await recordButton.click();

    // Fake media device feeds a tone; the running timer proves the
    // recorder is rolling. Take ~3 s of it.
    await expect(sheet.getByText(/^00:0[3-9]$/)).toBeVisible({
      timeout: 15_000,
    });

    const captureId = await saveAndCaptureId(page, () => recordButton.click());

    await expect(
      sheet
        .getByText(
          /Saving the recording|Listening for the words|Tracing the threads|Almost there|Saved\. This is the beginning\./,
        )
        .first(),
    ).toBeVisible();

    await waitForCaptureReady(page, captureId, 180_000);

    // Whisper may hear anything in a test tone, so assert arrival, not
    // transcript: this fresh vault's Recent list holds exactly one row
    // and it isn't failed.
    const rows = page.locator("main li");
    await expect(rows).toHaveCount(1);
    await expect(rows.first().getByText(/failed|processing/)).toHaveCount(0);
    await expect(page.getByText("Begin when you're ready.")).not.toBeVisible();
  });

  test("video capture is honestly disabled", async ({ page }) => {
    await signInAsOnboardedCreator(page);

    const video = page.getByRole("button", { name: "Video Coming soon" });
    await expect(video).toBeVisible();
    await expect(video).toBeDisabled();

    // The shipping modes stay live.
    await expect(
      page.getByRole("button", { name: "Voice A recording" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Note Typed lines" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Photo With caption" }),
    ).toBeEnabled();
  });
});

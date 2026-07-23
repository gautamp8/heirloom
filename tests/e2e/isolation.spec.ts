import { expect, test, type Page } from "@playwright/test";
import argon2 from "argon2";
import postgres from "postgres";
import { normalisePassphrase } from "../../src/lib/passphrase";
import { SAGAN_URL_PASSPHRASE, signInAsNominee } from "./helpers";

/**
 * Cross-vault isolation. Global setup seeds vault A (the Sagan archive).
 * There is no UI for provisioning a second creator, so this spec seeds a
 * second vault ("Beatrix Vaulter") directly in SQL — one distinctive note,
 * an indexed chunk, and a nominee with her own passphrase — then drives
 * the real UI and API to prove neither vault can see the other.
 */

const DB_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://gautam_prajapati@localhost:5433/heirloom_e2e";

const CREATOR_B_EMAIL = "beatrix-vaulter@e2e-isolation.heirloom.local";
const CREATOR_B_NAME = "Beatrix Vaulter";
const SECRET_TITLE = "Vault B secret";
const SECRET_BODY = "Vault B secret: the map is in the attic.";
// Dashes decode to spaces in /welcome?p=… and the auth route normalises
// separators, so hashing the normalised form matches both entry paths.
const NOMINEE_B_URL_PASSPHRASE = "vault-b-lantern-orchard-42";

// The UI renders this with a typographic apostrophe (&rsquo;), so match
// on the distinctive apostrophe-free middle rather than the exact string.
const EMPTY_STATE = /have that in the archive\. Try asking another way/i;

let db: ReturnType<typeof postgres>;
let vaultBCaptureId = "";

/** Deterministic, non-zero 768-dim pgvector literal. The values are
 *  synthetic on purpose: vault B's index only needs to exist, not to be
 *  semantically meaningful, because retrieval must never reach it. */
function syntheticEmbeddingLiteral(dim = 768): string {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = Math.sin((i + 1) * 12.9898) * 0.1;
  return `[${Array.from(v, (n) => n.toFixed(6)).join(",")}]`;
}

/** Vault B's nominee through the same welcome ceremony the helper uses. */
async function signInAsVaultBNominee(page: Page) {
  await page.goto(`/welcome?p=${NOMINEE_B_URL_PASSPHRASE}`);
  await expect(
    page.getByRole("button", { name: "Enter the archive" }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Enter the archive" }).click();
  await page.waitForURL("**/");
}

test.describe("cross-vault isolation", () => {
  test.beforeAll(async () => {
    db = postgres(DB_URL, { max: 2, transform: { undefined: null } });

    // Idempotent: drop any vault-B remnant from a previous run of this
    // spec (the vault cascades to captures, chunks, nominees, releases).
    await db`
      DELETE FROM vaults
       WHERE creator_id IN (SELECT id FROM users WHERE email = ${CREATOR_B_EMAIL})`;

    const [creator] = await db<{ id: string }[]>`
      INSERT INTO users (email, display_name)
      VALUES (${CREATOR_B_EMAIL}, ${CREATOR_B_NAME})
      ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id`;
    const [vault] = await db<{ id: string }[]>`
      INSERT INTO vaults (creator_id, name)
      VALUES (${creator.id}, 'Beatrix archive')
      RETURNING id`;

    // Mark onboarded and copy the seed vault's embedder stamp so the
    // embedding guard treats both vaults identically.
    await db`
      UPDATE vaults
         SET onboarded_at = now(),
             embedding_meta = (SELECT embedding_meta FROM vaults
                                WHERE id <> ${vault.id}
                                  AND embedding_meta IS NOT NULL
                                LIMIT 1)
       WHERE id = ${vault.id}`;

    const [capture] = await db<{ id: string }[]>`
      INSERT INTO captures (vault_id, kind, status, title, body, captured_at)
      VALUES (${vault.id}, 'note', 'ready', ${SECRET_TITLE}, ${SECRET_BODY}, now())
      RETURNING id`;
    vaultBCaptureId = capture.id;

    await db`
      INSERT INTO transcript_chunks (capture_id, vault_id, chunk_index, text, embedding)
      VALUES (${capture.id}, ${vault.id}, 0, ${SECRET_BODY},
              ${syntheticEmbeddingLiteral()}::vector)`;

    const hash = await argon2.hash(
      normalisePassphrase(NOMINEE_B_URL_PASSPHRASE),
      { type: argon2.argon2id },
    );
    const [nominee] = await db<{ id: string }[]>`
      INSERT INTO nominees (vault_id, name, relationship, letter_body,
                            passphrase_hash, passphrase_set_at)
      VALUES (${vault.id}, 'Nora', 'niece',
              'Nora - I kept one thing aside for you. Take your time.',
              ${hash}, now())
      RETURNING id`;

    await db`
      INSERT INTO nominee_releases (vault_id, capture_id, nominee_id, trigger,
                                    released_at, label)
      VALUES (${vault.id}, ${capture.id}, ${nominee.id}, 'scheduled', now(),
              'isolation spec seed')`;
  });

  test.afterAll(async () => {
    await db?.end({ timeout: 5 });
  });

  test("Sagan nominee's home shows no vault B content", async ({ page }) => {
    await signInAsNominee(page);

    // Positive control first: vault A rendered its own archive…
    await expect(page.getByText("From Carl Sagan").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Pale Blue Dot/i).first()).toBeVisible();

    // …and nothing from vault B leaked into it.
    await expect(page.getByText(/Vault B secret/i)).toHaveCount(0);
    await expect(page.getByText(/map is in the attic/i)).toHaveCount(0);
  });

  test("Reflect in vault A cannot draw on vault B content", async ({
    page,
  }) => {
    // Sign-in + a full local synthesis pass can brush the default budget.
    test.setTimeout(300_000);
    await signInAsNominee(page);
    await page.goto("/reflect");

    await page
      .getByRole("textbox", { name: "Ask the archive a question" })
      .fill("Where is the map?");
    const reflectResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/api/reflect") && r.request().method() === "POST",
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: "Ask" }).click();
    const resp = await reflectResponse;
    expect(resp.ok()).toBeTruthy();

    // Local synthesis is slow; wait for the SSE stream to fully close
    // (bounded by the per-test timeout above).
    await resp.finished();
    const sse = (await resp.body()).toString("utf8");

    // The stream ran to completion rather than erroring out…
    expect(sse).toContain("event: done");
    // …and nothing on the wire — claims, citations, answer — touches
    // vault B, whether by text or by capture id.
    expect(sse.toLowerCase()).not.toContain("attic");
    expect(sse).not.toContain(vaultBCaptureId);

    // Terminal UI is either the verbatim refusal or a grounded Sagan
    // answer with its citation strip; either way vault B stays invisible.
    await expect(
      page.getByText(EMPTY_STATE).or(page.getByText(/Drawn from/i)).first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText(/attic/i);
    await expect(page.locator("body")).not.toContainText("Vault B secret");
    await expect(page.locator("body")).not.toContainText(
      vaultBCaptureId.slice(0, 8),
    );
  });

  test("vault B nominee sees their capture and none of Sagan's", async ({
    page,
  }) => {
    await signInAsVaultBNominee(page);

    await expect(
      page.getByText(`From ${CREATOR_B_NAME}`).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/map is in the attic/i).first()).toBeVisible();

    await expect(page.getByText(/Carl Sagan/)).toHaveCount(0);
    await expect(page.getByText(/Pale Blue Dot/i)).toHaveCount(0);
  });

  test("vault A nominee cannot fetch vault B blobs", async ({ page }) => {
    // API-level: authenticate as the Sagan nominee without the ceremony.
    // The auth route normalises separators, so the dashed phrase works.
    const auth = await page.request.post("/api/auth/nominee-passphrase", {
      data: { passphrase: SAGAN_URL_PASSPHRASE },
    });
    expect(auth.ok()).toBeTruthy();
    expect((await auth.json()).role).toBe("nominee");

    // Positive control: a released Sagan photo streams fine…
    const [saganPhoto] = await db<{ id: string }[]>`
      SELECT c.id
        FROM captures c
        JOIN vaults v ON v.id = c.vault_id
        JOIN users u ON u.id = v.creator_id
       WHERE u.email = 'carl-sagan@heirloom.local'
         AND c.kind = 'photo'
         AND c.blob_url IS NOT NULL
       ORDER BY c.created_at ASC
       LIMIT 1`;
    expect(saganPhoto?.id).toBeTruthy();
    const own = await page.request.get(`/api/blob/${saganPhoto.id}`);
    expect(own.status()).toBe(200);

    // …while the vault-B capture stays a 4xx, never a leak.
    const cross = await page.request.get(`/api/blob/${vaultBCaptureId}`);
    expect(cross.status()).toBeGreaterThanOrEqual(400);
    expect(cross.status()).toBeLessThan(500);
  });
});

import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { signInAsNominee } from "./helpers";

/**
 * Sealed-letter condition engine, end to end.
 *
 * The Sagan seed ships one sealed letter ("When you feel insignificant")
 * with [semantic_match 0.55, first_visit] conditions — the first_visit
 * condition means it unlocks on the FIRST nominee home load of the run,
 * so that letter covers the first-visit path. The semantic / date /
 * state paths each get a fresh SQL-inserted letter (there is no creator
 * UI for authoring conditioned letters yet), scoped to the seed nominee.
 *
 * Note: /api/reflect emits a `sealed_letter` SSE event when a semantic
 * unlock fires, but room.tsx does not render it — the unlock is only
 * user-visible on the next Home load. The semantic test therefore
 * asserts the DB unlock plus the released capture appearing on Home.
 *
 * Runs serially with the rest of the suite; tolerates letters already
 * unlocked by earlier specs, depends only on the global-setup seed.
 */

const DB_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://gautam_prajapati@localhost:5433/heirloom_e2e";

const SEED_OCCASION = "When you feel insignificant";
// Unique per run so repeated runs against a long-lived instance
// (E2E_BASE_URL, no DB reset) never produce ambiguous text matches.
const TAG = `[e2e-letters ${Date.now().toString(36)}]`;

let sql: postgres.Sql;
let vaultId: string;
let nomineeId: string;
let seedLetterId: string;

type LetterState = {
  unlocked_at: Date | null;
  unlocked_by_trigger: string | null;
};

async function letterState(letterId: string): Promise<LetterState> {
  const [row] = await sql<LetterState[]>`
    SELECT unlocked_at, unlocked_by_trigger
      FROM sealed_letters
     WHERE id = ${letterId}
  `;
  return row ?? { unlocked_at: null, unlocked_by_trigger: null };
}

/** Insert a hidden note capture + sealed letter for the seed nominee.
 *  `copyIntentEmbeddingFrom` clones another letter's intent embedding so
 *  the spec never needs Ollama for setup. */
async function insertLetter(opts: {
  occasion: string;
  body: string;
  conditions: postgres.JSONValue;
  copyIntentEmbeddingFrom?: string;
}): Promise<{ letter_id: string; capture_id: string }> {
  const [cap] = await sql<{ id: string }[]>`
    INSERT INTO captures (vault_id, kind, status, title, body)
    VALUES (${vaultId}, 'note', 'ready', ${opts.occasion}, ${opts.body})
    RETURNING id
  `;
  const [letter] = opts.copyIntentEmbeddingFrom
    ? await sql<{ id: string }[]>`
        INSERT INTO sealed_letters
          (capture_id, vault_id, to_nominee_id, occasion_prompt,
           intent_embedding, conditions)
        SELECT ${cap.id}, ${vaultId}, ${nomineeId}, ${opts.occasion},
               intent_embedding, ${sql.json(opts.conditions)}
          FROM sealed_letters
         WHERE id = ${opts.copyIntentEmbeddingFrom}
        RETURNING id
      `
    : await sql<{ id: string }[]>`
        INSERT INTO sealed_letters
          (capture_id, vault_id, to_nominee_id, occasion_prompt,
           intent_embedding, conditions)
        VALUES (${cap.id}, ${vaultId}, ${nomineeId}, ${opts.occasion},
                NULL, ${sql.json(opts.conditions)})
        RETURNING id
      `;
  return { letter_id: letter.id, capture_id: cap.id };
}

test.describe("sealed letters", () => {
  test.beforeAll(async () => {
    sql = postgres(DB_URL, { max: 1 });

    // The Sagan seed vault + its single nominee ("You").
    const [archive] = await sql<{ vault_id: string; nominee_id: string }[]>`
      SELECT v.id AS vault_id, n.id AS nominee_id
        FROM vaults v
        JOIN users u ON u.id = v.creator_id
        JOIN nominees n ON n.vault_id = v.id
       WHERE u.email = 'carl-sagan@heirloom.local'
       ORDER BY n.created_at ASC
       LIMIT 1
    `;
    expect(archive, "Sagan seed vault + nominee must exist").toBeTruthy();
    vaultId = archive.vault_id;
    nomineeId = archive.nominee_id;

    const [seed] = await sql<{ id: string }[]>`
      SELECT id FROM sealed_letters
       WHERE vault_id = ${vaultId} AND occasion_prompt = ${SEED_OCCASION}
       LIMIT 1
    `;
    expect(seed, "seed sealed letter must exist").toBeTruthy();
    seedLetterId = seed.id;
  });

  test.afterAll(async () => {
    // Best-effort cleanup so a still-pending letter from a failed test
    // can't fire during a later spec's home load. Deleting the capture
    // cascades to sealed_letters / nominee_releases / transcript_chunks.
    try {
      if (vaultId) {
        await sql`
          DELETE FROM captures
           WHERE vault_id = ${vaultId} AND title LIKE ${TAG + "%"}
        `;
      }
    } catch {
      // Leftovers are tolerated by the rest of the suite.
    }
    await sql?.end();
  });

  test("first nominee home visit unlocks the seed first_visit letter", async ({
    page,
  }) => {
    // Earlier specs in a serial run may have already visited Home as the
    // nominee — the first_visit unlock is idempotent, so branch on the
    // pre-visit state instead of assuming this is the very first load.
    const before = await letterState(seedLetterId);

    await signInAsNominee(page);

    await expect
      .poll(async () => (await letterState(seedLetterId)).unlocked_at, {
        timeout: 30_000,
      })
      .not.toBeNull();

    if (!before.unlocked_at) {
      // Fired on THIS load → the ceremony card is on the home page.
      await expect(
        page.getByText("Carl Sagan sealed this for you").first(),
      ).toBeVisible();
      await expect(page.getByText(SEED_OCCASION).first()).toBeVisible();
      await expect(
        page.getByText("made of starlight that ran out of fuel").first(),
      ).toBeVisible();
      expect((await letterState(seedLetterId)).unlocked_by_trigger).toBe(
        "first_visit",
      );
    } else {
      // Already unlocked earlier in the run — the released capture is
      // simply part of the archive now.
      await expect(page.getByText(SEED_OCCASION).first()).toBeVisible();
    }
  });

  test("a Reflect question semantically unlocks a matching sealed letter", async ({
    page,
  }) => {
    const occasion = `${TAG} For when you feel small`;
    const { letter_id } = await insertLetter({
      occasion,
      body:
        "Smallness has a context. You are a way for the cosmos to know itself.",
      conditions: {
        any_of: [
          {
            kind: "semantic_match",
            threshold: 0.55,
            topic: "when they feel small or alone",
          },
        ],
      },
      // Same intent embedding the seed letter was designed around, so this
      // question clears the 0.55 gate the same way the seed's would.
      copyIntentEmbeddingFrom: seedLetterId,
    });

    await signInAsNominee(page);
    await page.goto("/reflect");
    await page
      .getByRole("textbox", { name: "What are you looking for?" })
      .fill("I feel so small and insignificant.");
    await page.getByRole("button", { name: "Ask" }).click();

    // The letter fires server-side before the grounding gate, but local
    // embedding (plus the route's self-heal passes) can be slow.
    await expect
      .poll(async () => (await letterState(letter_id)).unlocked_at, {
        timeout: 180_000,
        intervals: [2_000],
      })
      .not.toBeNull();
    expect((await letterState(letter_id)).unlocked_by_trigger).toBe(
      "semantic_match",
    );

    // The unlock released the capture to the nominee — it now appears on
    // Home (room.tsx does not surface the sealed_letter SSE event itself).
    await page.goto("/");
    await expect(page.getByText(occasion).first()).toBeVisible({
      timeout: 60_000,
    });
  });

  test("a past-dated letter unlocks on the next home visit", async ({
    page,
  }) => {
    // Sign in first: the sign-in itself lands on Home and runs a calendar
    // pass, so inserting afterwards proves the NEXT visit unlocks it.
    await signInAsNominee(page);

    const occasion = `${TAG} For the new year`;
    const { letter_id } = await insertLetter({
      occasion,
      body: "The date has long passed, so this opens on your next visit.",
      conditions: { any_of: [{ kind: "date", date: "2020-01-01" }] },
    });

    await page.goto("/");

    await expect(page.getByText(occasion).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByText("Carl Sagan sealed this for you").first(),
    ).toBeVisible();
    await expect(page.getByText("On 2020-01-01")).toBeVisible();

    const state = await letterState(letter_id);
    expect(state.unlocked_at).not.toBeNull();
    expect(state.unlocked_by_trigger).toBe("date");
  });

  test("tapping a mood chip unlocks a state-conditioned letter", async ({
    page,
  }) => {
    await signInAsNominee(page);

    const occasion = `${TAG} For a stardust moment`;
    const { letter_id } = await insertLetter({
      occasion,
      body: "The nitrogen in your DNA was forged inside a collapsing star.",
      // Matches the chip text by the loose string check — no embedding
      // needed (intent_embedding stays NULL).
      conditions: { any_of: [{ kind: "state", state: "we are stardust" }] },
    });

    // The Sagan archive renders custom mood chips (pickMoodChips keys off
    // the creator name) — "We are stardust", not the generic "I miss you".
    await page.getByRole("button", { name: "We are stardust" }).click();

    // The mood endpoint embeds the state via local Ollama before firing,
    // then MoodCard confirms inline.
    await expect(
      page.getByText(`${occasion} - opened just for you.`),
    ).toBeVisible({ timeout: 120_000 });

    await expect
      .poll(async () => (await letterState(letter_id)).unlocked_at, {
        timeout: 30_000,
      })
      .not.toBeNull();
    expect((await letterState(letter_id)).unlocked_by_trigger).toBe("state");
  });
});

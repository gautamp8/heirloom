import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  seedVault,
  setupSqlite,
  unitVec,
  vecWithSimilarity,
} from "../helpers/db";

// No VAPID keys → sendToUser() short-circuits, so the fire path's push
// fan-out never touches the network.
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;
delete process.env.VAPID_SUBJECT;

// Backend is frozen at import time, so the sqlite env must be set (via
// setupSqlite) before @/lib/db loads — hence top-level await, no static
// import of DB-touching modules.
const db = await setupSqlite();
const { sql, vec } = db;
const { fireLetterConditions } = await import("@/lib/letter-conditions");

async function seedNominee(vault_id: string, name: string) {
  const user_id = randomUUID();
  await sql`INSERT INTO users (id, email, display_name)
            VALUES (${user_id}, ${`${user_id}@test.local`}, ${name})`;
  const nominee_id = randomUUID();
  await sql`INSERT INTO nominees (id, vault_id, user_id, name)
            VALUES (${nominee_id}, ${vault_id}, ${user_id}, ${name})`;
  return { user_id, nominee_id };
}

/** Vault + one linked nominee + the nominee session that fires triggers. */
async function freshVault() {
  const { vault_id } = await seedVault(sql);
  const { user_id, nominee_id } = await seedNominee(vault_id, "Nominee One");
  const session = { user_id, vault_id, role: "nominee" as const };
  return { vault_id, nominee_id, session };
}

async function sealLetter(opts: {
  vault_id: string;
  conditions: Parameters<typeof sql.json>[0];
  intent?: number[];
  to_nominee_id?: string | null;
}) {
  const capture_id = randomUUID();
  await sql`INSERT INTO captures (id, vault_id, kind, status, title)
            VALUES (${capture_id}, ${opts.vault_id}, ${"note"}, ${"ready"},
                    ${"sealed letter body"})`;
  const letter_id = randomUUID();
  await sql`INSERT INTO sealed_letters
              (id, capture_id, vault_id, to_nominee_id, occasion_prompt,
               intent_embedding, conditions)
            VALUES (${letter_id}, ${capture_id}, ${opts.vault_id},
                    ${opts.to_nominee_id ?? null}, ${"For a hard day"},
                    ${opts.intent ? vec(opts.intent) : null},
                    ${sql.json(opts.conditions)})`;
  return { letter_id, capture_id };
}

async function letterRow(letter_id: string) {
  const [row] = await sql<
    { unlocked_at: string | null; unlocked_by_trigger: string | null }[]
  >`SELECT unlocked_at, unlocked_by_trigger
      FROM sealed_letters WHERE id = ${letter_id}`;
  return row;
}

async function releases(capture_id: string) {
  return sql<{ nominee_id: string; trigger: string; label: string }[]>`
    SELECT nominee_id, trigger, label FROM nominee_releases
     WHERE capture_id = ${capture_id}`;
}

describe("semantic_match", () => {
  const conditions = {
    any_of: [{ kind: "semantic_match", threshold: 0.55, topic: "feeling small" }],
  };

  it("unlocks at similarity >= threshold and records the release", async () => {
    const { vault_id, nominee_id, session } = await freshVault();
    const { letter_id, capture_id } = await sealLetter({
      vault_id,
      to_nominee_id: nominee_id,
      intent: unitVec(1),
      conditions,
    });

    const fired = await fireLetterConditions(session, {
      trigger_kind: "semantic",
      query: "some days I feel so small",
      embedding: vecWithSimilarity(1, 2, 0.6),
    });

    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({
      letter_id,
      capture_id,
      occasion_prompt: "For a hard day",
      trigger: "For a question like this",
      to_nominee_id: nominee_id,
    });

    const row = await letterRow(letter_id);
    expect(row.unlocked_at).not.toBeNull();
    expect(row.unlocked_by_trigger).toBe("semantic_match");

    const rel = await releases(capture_id);
    expect(rel).toHaveLength(1);
    expect(rel[0]).toMatchObject({
      nominee_id,
      trigger: "scheduled",
      label: "sealed letter - semantic_match",
    });
  });

  it("does not unlock below the threshold", async () => {
    const { vault_id, nominee_id, session } = await freshVault();
    const { letter_id, capture_id } = await sealLetter({
      vault_id,
      to_nominee_id: nominee_id,
      intent: unitVec(1),
      conditions,
    });

    const fired = await fireLetterConditions(session, {
      trigger_kind: "semantic",
      query: "some days I feel so small",
      embedding: vecWithSimilarity(1, 2, 0.4),
    });

    expect(fired).toEqual([]);
    expect((await letterRow(letter_id)).unlocked_at).toBeNull();
    expect(await releases(capture_id)).toHaveLength(0);
  });

  it("is idempotent — a second firing returns empty and adds no releases", async () => {
    const { vault_id, nominee_id, session } = await freshVault();
    const { capture_id } = await sealLetter({
      vault_id,
      to_nominee_id: nominee_id,
      intent: unitVec(1),
      conditions,
    });
    const ctx = {
      trigger_kind: "semantic" as const,
      query: "feeling small again",
      embedding: vecWithSimilarity(1, 2, 0.6),
    };

    const first = await fireLetterConditions(session, ctx);
    expect(first).toHaveLength(1);

    const second = await fireLetterConditions(session, ctx);
    expect(second).toEqual([]);
    expect(await releases(capture_id)).toHaveLength(1);
  });
});

describe("state trigger", () => {
  // ctx.embedding is always a full 768-dim vector here so embedOne (and
  // therefore Ollama) is never invoked.
  it("matches by substring in both directions", async () => {
    const { vault_id, nominee_id, session } = await freshVault();
    // Orthogonal intent embedding keeps the semantic fall-through cold —
    // only the substring path can fire.
    const ctxContainsCond = await sealLetter({
      vault_id,
      to_nominee_id: nominee_id,
      intent: unitVec(3),
      conditions: { any_of: [{ kind: "state", state: "i miss you" }] },
    });
    const condContainsCtx = await sealLetter({
      vault_id,
      to_nominee_id: nominee_id,
      intent: unitVec(3),
      conditions: {
        any_of: [{ kind: "state", state: "feeling overwhelmed and lost" }],
      },
    });

    const a = await fireLetterConditions(session, {
      trigger_kind: "state",
      state: "I miss you so much",
      embedding: unitVec(5),
    });
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      letter_id: ctxContainsCond.letter_id,
      trigger: 'When you said "i miss you"',
    });

    const b = await fireLetterConditions(session, {
      trigger_kind: "state",
      state: "overwhelmed and lost",
      embedding: unitVec(5),
    });
    expect(b).toHaveLength(1);
    expect(b[0].letter_id).toBe(condContainsCtx.letter_id);
    expect((await letterRow(condContainsCtx.letter_id)).unlocked_by_trigger).toBe(
      "state",
    );
  });

  it("falls through to intent similarity when no substring matches", async () => {
    const { vault_id, nominee_id, session } = await freshVault();
    const { letter_id } = await sealLetter({
      vault_id,
      to_nominee_id: nominee_id,
      intent: unitVec(4),
      conditions: { any_of: [{ kind: "state", state: "grieving" }] },
    });

    const fired = await fireLetterConditions(session, {
      trigger_kind: "state",
      state: "hollow today",
      embedding: vecWithSimilarity(4, 5, 0.7),
    });
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({
      letter_id,
      trigger: 'When you said "hollow today"',
    });
  });
});

describe("first_visit", () => {
  it("fires on a first_visit trigger", async () => {
    const { vault_id, nominee_id, session } = await freshVault();
    const { letter_id } = await sealLetter({
      vault_id,
      to_nominee_id: nominee_id,
      intent: unitVec(1),
      conditions: { any_of: [{ kind: "first_visit" }] },
    });

    const fired = await fireLetterConditions(session, {
      trigger_kind: "first_visit",
    });
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ letter_id, trigger: "First visit" });
  });
});

describe("date", () => {
  it("fires past dates on a calendar trigger, leaves future dates sealed", async () => {
    const { vault_id, nominee_id, session } = await freshVault();
    const past = await sealLetter({
      vault_id,
      to_nominee_id: nominee_id,
      intent: unitVec(1),
      conditions: { any_of: [{ kind: "date", date: "2020-01-01" }] },
    });
    const future = await sealLetter({
      vault_id,
      to_nominee_id: nominee_id,
      intent: unitVec(1),
      conditions: { any_of: [{ kind: "date", date: "2199-01-01" }] },
    });

    const fired = await fireLetterConditions(session, {
      trigger_kind: "calendar",
    });
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({
      letter_id: past.letter_id,
      trigger: "On 2020-01-01",
    });
    expect((await letterRow(future.letter_id)).unlocked_at).toBeNull();
  });
});

describe("broadcast letters (to_nominee_id NULL)", () => {
  it("fans a single unlock out to every nominee in the vault", async () => {
    const { vault_id, nominee_id, session } = await freshVault();
    const second = await seedNominee(vault_id, "Nominee Two");
    const { capture_id } = await sealLetter({
      vault_id,
      to_nominee_id: null,
      intent: unitVec(1),
      conditions: { any_of: [{ kind: "first_visit" }] },
    });

    const fired = await fireLetterConditions(session, {
      trigger_kind: "first_visit",
    });
    expect(fired).toHaveLength(1);

    const rel = await releases(capture_id);
    expect(rel.map((r) => r.nominee_id).sort()).toEqual(
      [nominee_id, second.nominee_id].sort(),
    );
  });
});

describe("unimplemented kinds", () => {
  // Documented v1 gap: life_event (and calendar-rule) conditions always
  // evaluate to null in matchOne, so a letter gated only on them can never
  // unlock. Do not "fix" this test — it pins the current behavior until
  // nominee-side life event tracking lands.
  it("a life_event-only letter never unlocks on any trigger", async () => {
    const { vault_id, nominee_id, session } = await freshVault();
    const { letter_id, capture_id } = await sealLetter({
      vault_id,
      to_nominee_id: nominee_id,
      intent: unitVec(6),
      conditions: {
        any_of: [{ kind: "life_event", event_kind: "wedding" }],
      },
    });

    const attempts = await Promise.all([
      fireLetterConditions(session, { trigger_kind: "first_visit" }),
      fireLetterConditions(session, { trigger_kind: "calendar" }),
      fireLetterConditions(session, {
        trigger_kind: "state",
        state: "getting married",
        embedding: vecWithSimilarity(6, 7, 0.99),
      }),
      fireLetterConditions(session, {
        trigger_kind: "semantic",
        query: "advice for my wedding",
        embedding: vecWithSimilarity(6, 7, 0.99),
      }),
    ]);

    expect(attempts.flat()).toEqual([]);
    expect((await letterRow(letter_id)).unlocked_at).toBeNull();
    expect(await releases(capture_id)).toHaveLength(0);
  });
});

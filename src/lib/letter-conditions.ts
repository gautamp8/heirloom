import type postgres from "postgres";
import { sqlAdmin } from "./db";
import { embedOne, vectorLiteral } from "./embed";
import type { Session } from "./auth";
import { sendToUser } from "./notifications";

/**
 * The conditions DSL stored in sealed_letters.conditions:
 *
 *   {"any_of": [
 *      {"kind": "date", "date": "2030-04-12"},
 *      {"kind": "life_event", "event_kind": "wedding", "subject_person_id": "..."},
 *      {"kind": "calendar", "rule": "anniversary_of_loss"},
 *      {"kind": "state", "state": "struggling"},
 *      {"kind": "semantic_match", "threshold": 0.55, "topic": "feeling lost"},
 *      {"kind": "first_visit"}
 *   ]}
 *
 * When a letter fires we:
 *   - INSERT a nominee_releases row (RLS gates the underlying capture)
 *   - UPDATE sealed_letters SET unlocked_at = now(), unlocked_by_trigger = <kind>
 * The same letter is never re-fired.
 */

type AnyCond =
  | { kind: "date"; date: string }
  | { kind: "life_event"; event_kind: string; subject_person_id?: string }
  | { kind: "calendar"; rule: string }
  | { kind: "state"; state: string }
  | { kind: "semantic_match"; threshold?: number; topic?: string }
  | { kind: "first_visit" };

export type TriggerContext =
  | { trigger_kind: "first_visit" }
  | { trigger_kind: "calendar" } // daily-check style (date, life_event, anniversary)
  | { trigger_kind: "state"; state: string; embedding?: number[] }
  | { trigger_kind: "semantic"; query: string; embedding: number[] };

export type FiredLetter = {
  letter_id: string;
  capture_id: string;
  occasion_prompt: string;
  trigger: string;
  to_nominee_id: string | null;
};

/**
 * Try to fire any sealed letters whose conditions are met. Idempotent —
 * already-unlocked letters are skipped. Returns the letters that fired
 * IN THIS CALL (callers can surface them with a "newly unlocked" treatment).
 */
export async function fireLetterConditions(
  session: Session,
  ctx: TriggerContext,
): Promise<FiredLetter[]> {
  // Today's calendar context — used by the date/calendar/life_event checks.
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);

  // Pre-compute the topic embedding for state triggers so we can do
  // semantic match against the letter's intent embedding.
  let stateEmbedding: number[] | null = null;
  if (ctx.trigger_kind === "state") {
    stateEmbedding =
      ctx.embedding && ctx.embedding.length === 768
        ? ctx.embedding
        : await embedOne(ctx.state);
  }

  // The engine runs PRIVILEGED. Nominee RLS only shows unlocked letters,
  // so we can't query pending letters under the nominee session. We re-
  // verify scoping (vault_id, nominee_id) explicitly in every query.
  if (!sqlAdmin) throw new Error("admin_db_unavailable");
  const adm = sqlAdmin;

  // Resolve which nominee_id this session belongs to (if nominee role).
  let nomineeId: string | null = null;
  if (session.role === "nominee") {
    const [n] = await adm<{ id: string }[]>`
      SELECT id FROM nominees
       WHERE user_id = ${session.user_id} AND vault_id = ${session.vault_id}
       LIMIT 1
    `;
    nomineeId = n?.id ?? null;
  }

  // Fetch every pending (un-unlocked) letter targeted at this nominee
  // (or to everyone). For semantic triggers we ALSO project the similarity.
  const pending = await fetchPending(
    adm,
    session.vault_id,
    nomineeId,
    ctx.trigger_kind === "semantic" ? ctx.embedding : stateEmbedding,
  );
  const fired: FiredLetter[] = [];
  for (const p of pending) {
    const conds = parseConditions(p.conditions);
    const triggered = matchConditions(conds, {
      ctx,
      todayISO,
      intent_similarity: p.intent_similarity,
    });
    if (!triggered) continue;

    await adm`
      UPDATE sealed_letters
         SET unlocked_at = now(), unlocked_by_trigger = ${triggered.kind}
       WHERE id = ${p.id} AND unlocked_at IS NULL
    `;

    if (p.to_nominee_id) {
      await adm`
        INSERT INTO nominee_releases (vault_id, capture_id, nominee_id, trigger,
                                      released_at, label)
        VALUES (${session.vault_id}, ${p.capture_id}, ${p.to_nominee_id},
                'scheduled', now(), ${"sealed letter — " + (triggered?.kind ?? "")})
        ON CONFLICT DO NOTHING
      `;
    } else {
      const targets = await adm<{ id: string }[]>`
        SELECT id FROM nominees WHERE vault_id = ${session.vault_id}
      `;
      for (const t of targets) {
        await adm`
          INSERT INTO nominee_releases (vault_id, capture_id, nominee_id, trigger,
                                        released_at, label)
          VALUES (${session.vault_id}, ${p.capture_id}, ${t.id},
                  'scheduled', now(), ${"sealed letter — " + triggered.kind})
          ON CONFLICT DO NOTHING
        `;
      }
    }

    fired.push({
      letter_id: p.id,
      capture_id: p.capture_id,
      occasion_prompt: p.occasion_prompt,
      trigger: triggered.label,
      to_nominee_id: p.to_nominee_id,
    });

    // Notify recipients. We don't await delivery — push services have
    // their own retry semantics and a failure shouldn't block the
    // grounding/retrieval path.
    void notifyLetterUnlocked(
      adm,
      session.vault_id,
      p.to_nominee_id,
      p.occasion_prompt,
    );
  }
  return fired;
}

async function notifyLetterUnlocked(
  adm: postgres.Sql,
  vault_id: string,
  to_nominee_id: string | null,
  occasion_prompt: string,
): Promise<void> {
  try {
    const recipients = to_nominee_id
      ? await adm<{ user_id: string | null }[]>`
          SELECT user_id FROM nominees WHERE id = ${to_nominee_id}
        `
      : await adm<{ user_id: string | null }[]>`
          SELECT user_id FROM nominees WHERE vault_id = ${vault_id}
        `;
    for (const r of recipients) {
      if (!r.user_id) continue;
      await sendToUser(r.user_id, "letter", {
        title: "A letter is waiting",
        body: occasion_prompt,
        url: "/",
        tag: `letter-${to_nominee_id ?? "broadcast"}`,
      });
    }
  } catch (e) {
    console.warn("[push] letter-unlock notify failed", e);
  }
}

type PendingRow = {
  id: string;
  capture_id: string;
  to_nominee_id: string | null;
  occasion_prompt: string;
  conditions: unknown;
  intent_similarity: number | null;
};

async function fetchPending(
  tx: postgres.Sql,
  vault_id: string,
  nominee_id: string | null,
  probe_embedding: number[] | null,
): Promise<PendingRow[]> {
  if (probe_embedding && probe_embedding.length === 768) {
    const vec = vectorLiteral(probe_embedding);
    return tx<PendingRow[]>`
      SELECT id, capture_id, to_nominee_id, occasion_prompt, conditions,
             CASE WHEN intent_embedding IS NULL THEN NULL
                  ELSE 1 - (intent_embedding <=> ${vec}::vector)
             END AS intent_similarity
        FROM sealed_letters
       WHERE vault_id = ${vault_id}
         AND unlocked_at IS NULL
         AND (to_nominee_id IS NULL OR to_nominee_id = ${nominee_id})
       ORDER BY created_at ASC
    `;
  }
  return tx<PendingRow[]>`
    SELECT id, capture_id, to_nominee_id, occasion_prompt, conditions,
           NULL::numeric AS intent_similarity
      FROM sealed_letters
     WHERE vault_id = ${vault_id}
       AND unlocked_at IS NULL
       AND (to_nominee_id IS NULL OR to_nominee_id = ${nominee_id})
     ORDER BY created_at ASC
  `;
}

function parseConditions(raw: unknown): AnyCond[] {
  // Conditions can arrive as a JSONB object or a JSON-encoded string;
  // handle both shapes.
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!value || typeof value !== "object") return [];
  const r = value as { any_of?: AnyCond[] };
  return Array.isArray(r.any_of) ? r.any_of : [];
}

type MatchResult = { kind: string; label: string };

function matchConditions(
  conds: AnyCond[],
  state: {
    ctx: TriggerContext;
    todayISO: string;
    intent_similarity: number | null;
  },
): MatchResult | null {
  for (const c of conds) {
    const r = matchOne(c, state);
    if (r) return r;
  }
  return null;
}

function matchOne(
  c: AnyCond,
  state: {
    ctx: TriggerContext;
    todayISO: string;
    intent_similarity: number | null;
  },
): MatchResult | null {
  switch (c.kind) {
    case "first_visit":
      // Fires on the first-visit calendar pass (run once per session entry).
      if (
        state.ctx.trigger_kind === "first_visit" ||
        state.ctx.trigger_kind === "calendar"
      ) {
        return { kind: "first_visit", label: "First visit" };
      }
      return null;
    case "date":
      if (state.ctx.trigger_kind !== "calendar") return null;
      return state.todayISO >= c.date
        ? { kind: "date", label: `On ${c.date}` }
        : null;
    case "life_event":
      // Not implemented in v1 — would need a life_events lookup per nominee.
      // Will be added when nominee-side life event tracking lands.
      return null;
    case "calendar":
      // Anniversary rules not implemented in v1.
      return null;
    case "state":
      if (state.ctx.trigger_kind !== "state") return null;
      // A state match is loose: any state trigger that includes this
      // letter's intent topic. The semantic-similarity path below is the
      // higher-fidelity check.
      if (
        state.ctx.state.toLowerCase().includes(c.state.toLowerCase()) ||
        c.state.toLowerCase().includes(state.ctx.state.toLowerCase())
      ) {
        return { kind: "state", label: `When you said "${c.state}"` };
      }
      // Fall through to semantic if we have an embedding similarity.
      if (
        state.intent_similarity !== null &&
        state.intent_similarity >= 0.55
      ) {
        return {
          kind: "state",
          label: `When you said "${state.ctx.state}"`,
        };
      }
      return null;
    case "semantic_match":
      // Fires on either a Reflection query (semantic trigger) or a mood
      // tap (state trigger) — both carry an embedding we can compare
      // against the letter's intent embedding.
      if (
        state.ctx.trigger_kind !== "semantic" &&
        state.ctx.trigger_kind !== "state"
      ) {
        return null;
      }
      if (state.intent_similarity === null) return null;
      const threshold = c.threshold ?? 0.55;
      if (state.intent_similarity >= threshold) {
        return {
          kind: "semantic_match",
          label:
            state.ctx.trigger_kind === "state"
              ? `For when ${state.ctx.state.toLowerCase()}`
              : `For a question like this`,
        };
      }
      return null;
  }
  return null;
}

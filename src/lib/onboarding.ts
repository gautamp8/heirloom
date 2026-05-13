import argon2 from "argon2";
import { sql, withRls } from "./db";
import { embedOne, vectorLiteral } from "./embed";
import { generatePassphrase, normalisePassphrase } from "./passphrase";
import type { Session } from "./auth";

export type OnboardingStatus = {
  onboarded: boolean;
  has_self_person: boolean;
  life_events_count: number;
  nominees_count: number;
  sealed_letters_count: number;
};

export async function getOnboardingStatus(
  session: Session,
): Promise<OnboardingStatus> {
  return withRls(session.user_id, session.role, async (tx) => {
    const [row] = await tx<
      {
        onboarded_at: Date | null;
        has_self: boolean;
        life_events_count: number;
        nominees_count: number;
        sealed_letters_count: number;
      }[]
    >`
      SELECT
        v.onboarded_at,
        EXISTS (
          SELECT 1 FROM people p WHERE p.vault_id = v.id AND p.relation = 'self'
        ) AS has_self,
        (SELECT COUNT(*)::int FROM life_events l WHERE l.vault_id = v.id) AS life_events_count,
        (SELECT COUNT(*)::int FROM nominees n WHERE n.vault_id = v.id) AS nominees_count,
        (SELECT COUNT(*)::int FROM sealed_letters s WHERE s.vault_id = v.id) AS sealed_letters_count
      FROM vaults v
      WHERE v.id = ${session.vault_id}
    `;
    return {
      onboarded: !!row?.onboarded_at,
      has_self_person: !!row?.has_self,
      life_events_count: row?.life_events_count ?? 0,
      nominees_count: row?.nominees_count ?? 0,
      sealed_letters_count: row?.sealed_letters_count ?? 0,
    };
  });
}

/**
 * Step 1: persist the creator's name + (optional) selfie face embedding.
 *  • Updates users.display_name
 *  • Inserts/updates the people row with relation='self', confirmed=true,
 *    and the face-api.js 128-dim reference embedding.
 */
export async function saveSelf(
  session: Session,
  opts: {
    display_name: string;
    face_embedding?: number[]; // 128-dim from face-api.js
  },
): Promise<void> {
  const name = opts.display_name.trim();
  if (!name) throw new Error("missing_name");

  await withRls(session.user_id, session.role, async (tx) => {
    await tx`UPDATE users SET display_name = ${name} WHERE id = ${session.user_id}`;

    const vec =
      opts.face_embedding && opts.face_embedding.length === 128
        ? vectorLiteral(opts.face_embedding)
        : null;

    // One self-person per vault. Upsert by relation='self'.
    const [existing] = await tx<{ id: string }[]>`
      SELECT id FROM people WHERE vault_id = ${session.vault_id} AND relation = 'self'
    `;
    if (existing) {
      if (vec) {
        await tx`
          UPDATE people SET display_name = ${name},
                            reference_embedding = ${vec}::vector,
                            confirmed = TRUE
           WHERE id = ${existing.id}
        `;
      } else {
        await tx`
          UPDATE people SET display_name = ${name} WHERE id = ${existing.id}
        `;
      }
    } else {
      if (vec) {
        await tx`
          INSERT INTO people (vault_id, display_name, relation, user_id,
                              reference_embedding, confirmed)
          VALUES (${session.vault_id}, ${name}, 'self', ${session.user_id},
                  ${vec}::vector, TRUE)
        `;
      } else {
        await tx`
          INSERT INTO people (vault_id, display_name, relation, user_id, confirmed)
          VALUES (${session.vault_id}, ${name}, 'self', ${session.user_id}, TRUE)
        `;
      }
    }
  });
}

/**
 * Step 2: life events (anchors) — embed label+description and insert.
 */
export async function saveLifeEvents(
  session: Session,
  events: {
    kind: string;
    label: string;
    event_date?: string | null;
    recurrence?: "yearly" | "once" | null;
    description?: string | null;
  }[],
): Promise<number> {
  if (events.length === 0) return 0;

  // Generate embeddings sequentially (small batch, ~5 events typical)
  const enriched = await Promise.all(
    events.map(async (e) => {
      const text = [e.label, e.description].filter(Boolean).join(". ");
      const emb = text ? await embedOne(text) : null;
      return { ...e, embedding: emb };
    }),
  );

  await withRls(session.user_id, session.role, async (tx) => {
    for (const e of enriched) {
      const vec = e.embedding ? vectorLiteral(e.embedding) : null;
      await tx`
        INSERT INTO life_events
          (vault_id, kind, label, event_date, recurrence, description, embedding)
        VALUES
          (${session.vault_id}, ${e.kind}, ${e.label},
           ${e.event_date ?? null}, ${e.recurrence ?? null},
           ${e.description ?? null},
           ${vec ? tx`${vec}::vector` : null})
      `;
    }
  });
  return enriched.length;
}

/**
 * Step 3: add nominees. Optionally adds a birthday life_event per nominee
 * with subject_person_id linking to a people row for that nominee.
 */
export type SavedNominee = {
  id: string;
  name: string;
  passphrase: string; // plaintext — caller shows ONCE then drops
};

export async function saveNominees(
  session: Session,
  nominees: {
    name: string;
    relation?: string | null;
    email?: string | null;
    birthday?: string | null;
  }[],
): Promise<{ inserted: number; nominees: SavedNominee[] }> {
  if (nominees.length === 0) return { inserted: 0, nominees: [] };

  let inserted = 0;
  const out: SavedNominee[] = [];

  // Pre-hash outside the transaction (argon2 is ~100ms each on M4 Pro)
  const prepared: {
    raw: (typeof nominees)[number];
    passphrase: string;
    passphrase_hash: string;
  }[] = [];
  for (const n of nominees) {
    if (!n.name?.trim()) continue;
    const passphrase = generatePassphrase();
    const passphrase_hash = await argon2.hash(normalisePassphrase(passphrase), {
      type: argon2.argon2id,
    });
    prepared.push({ raw: n, passphrase, passphrase_hash });
  }

  await withRls(session.user_id, session.role, async (tx) => {
    for (const { raw: n, passphrase, passphrase_hash } of prepared) {
      const [nominee] = await tx<{ id: string }[]>`
        INSERT INTO nominees (vault_id, name, relationship, email,
                              passphrase_hash, passphrase_set_at)
        VALUES (${session.vault_id}, ${n.name.trim()},
                ${n.relation?.trim() ?? null}, ${n.email?.trim() ?? null},
                ${passphrase_hash}, now())
        RETURNING id
      `;
      inserted += 1;
      out.push({ id: nominee.id, name: n.name.trim(), passphrase });

      // Mirror nominee into people so face-recognition can later cluster them.
      const [person] = await tx<{ id: string }[]>`
        INSERT INTO people (vault_id, display_name, relation, nominee_id)
        VALUES (${session.vault_id}, ${n.name.trim()},
                ${n.relation?.trim() ?? 'nominee'}, ${nominee.id})
        RETURNING id
      `;

      if (n.birthday) {
        const text = `${n.name}'s birthday`;
        const emb = await embedOne(text);
        await tx`
          INSERT INTO life_events
            (vault_id, kind, label, event_date, recurrence,
             subject_person_id, embedding)
          VALUES
            (${session.vault_id}, 'birth', ${text}, ${n.birthday}, 'yearly',
             ${person.id}, ${vectorLiteral(emb)}::vector)
        `;
      }
    }
  });
  return { inserted, nominees: out };
}

/**
 * Step 4: save sealed letters. Each draft becomes:
 *   - one note capture (the letter body)
 *   - one sealed_letters row with conditions DSL + intent_embedding
 * The capture is NOT released yet — release fires when conditions trigger.
 */
export async function saveSealedLetters(
  session: Session,
  drafts: {
    to_nominee_name: string;
    occasion_prompt: string;
    body: string;
    trigger_hint: string;
  }[],
): Promise<{ inserted: number }> {
  if (drafts.length === 0) return { inserted: 0 };

  let inserted = 0;
  for (const d of drafts) {
    if (!d.body.trim() || !d.occasion_prompt.trim()) continue;

    // Embedding is over the occasion prompt + trigger hint so semantic-match
    // unlocks fire on queries similar to the LETTER'S INTENT, not its body.
    const intent_text = `${d.occasion_prompt}. ${d.trigger_hint}`;
    const intent_vec = await embedOne(intent_text);

    await withRls(session.user_id, session.role, async (tx) => {
      // Find the nominee by name
      const [nominee] = await tx<{ id: string }[]>`
        SELECT id FROM nominees
         WHERE vault_id = ${session.vault_id}
           AND lower(name) = lower(${d.to_nominee_name})
         LIMIT 1
      `;

      // Create the underlying note capture (status='ready' since we have body now)
      const [cap] = await tx<{ id: string }[]>`
        INSERT INTO captures (vault_id, kind, status, body, title)
        VALUES (${session.vault_id}, 'note', 'ready',
                ${d.body.trim()},
                ${d.occasion_prompt.slice(0, 80)})
        RETURNING id
      `;

      // Conditions DSL — map trigger_hint to one of our condition kinds.
      // Default is semantic_match with the intent embedding; we add a
      // first_visit fallback so the letter is always reachable.
      const conditions = {
        any_of: [
          {
            kind: "semantic_match",
            threshold: 0.55,
            topic: d.trigger_hint,
          },
          { kind: "first_visit" },
        ],
      };

      await tx`
        INSERT INTO sealed_letters
          (capture_id, vault_id, to_nominee_id, occasion_prompt,
           intent_embedding, conditions)
        VALUES
          (${cap.id}, ${session.vault_id}, ${nominee?.id ?? null},
           ${d.occasion_prompt}, ${vectorLiteral(intent_vec)}::vector,
           ${tx.json(conditions)})
      `;
      inserted += 1;
    });
  }
  return { inserted };
}

export async function markOnboarded(session: Session): Promise<void> {
  await withRls(session.user_id, session.role, async (tx) => {
    await tx`
      UPDATE vaults SET onboarded_at = now()
       WHERE id = ${session.vault_id} AND onboarded_at IS NULL
    `;
  });
}

/**
 * Regenerate a nominee's passphrase. We can't show the existing one
 * because we only kept the argon2id hash. The new plaintext is returned
 * ONCE — the caller is responsible for surfacing it to the creator so
 * they can re-share it with the recipient.
 */
export async function regenerateNomineePassphrase(
  session: Session,
  nominee_id: string,
): Promise<{ passphrase: string } | null> {
  const passphrase = generatePassphrase();
  const passphrase_hash = await argon2.hash(normalisePassphrase(passphrase), {
    type: argon2.argon2id,
  });
  const updated = await withRls(session.user_id, session.role, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      UPDATE nominees
         SET passphrase_hash = ${passphrase_hash}, passphrase_set_at = now()
       WHERE id = ${nominee_id} AND vault_id = ${session.vault_id}
       RETURNING id
    `;
    return rows.length > 0;
  });
  return updated ? { passphrase } : null;
}

/**
 * The settings surface needs everything onboarding gathers, plus the
 * existing list of nominees (without exposing passphrase hashes).
 */
export async function getSettings(session: Session): Promise<{
  user: { display_name: string };
  vault: { onboarded_at: string | null };
  life_events: {
    id: string;
    kind: string;
    label: string;
    event_date: string | null;
    recurrence: string | null;
  }[];
  nominees: {
    id: string;
    name: string;
    relationship: string | null;
    email: string | null;
    has_passphrase: boolean;
    passphrase_set_at: string | null;
  }[];
}> {
  return withRls(session.user_id, session.role, async (tx) => {
    const [user] = await tx<{ display_name: string }[]>`
      SELECT display_name FROM users WHERE id = ${session.user_id}
    `;
    const [vault] = await tx<{ onboarded_at: Date | null }[]>`
      SELECT onboarded_at FROM vaults WHERE id = ${session.vault_id}
    `;
    const life_events = await tx<
      {
        id: string;
        kind: string;
        label: string;
        event_date: Date | null;
        recurrence: string | null;
      }[]
    >`
      SELECT id, kind, label, event_date, recurrence
        FROM life_events
       WHERE vault_id = ${session.vault_id}
       ORDER BY event_date NULLS LAST, label
    `;
    const nominees = await tx<
      {
        id: string;
        name: string;
        relationship: string | null;
        email: string | null;
        has_passphrase: boolean;
        passphrase_set_at: Date | null;
      }[]
    >`
      SELECT id, name, relationship, email,
             (passphrase_hash IS NOT NULL) AS has_passphrase,
             passphrase_set_at
        FROM nominees
       WHERE vault_id = ${session.vault_id}
       ORDER BY created_at ASC
    `;
    return {
      user: { display_name: user?.display_name ?? "Friend" },
      vault: { onboarded_at: vault?.onboarded_at?.toISOString() ?? null },
      life_events: life_events.map((e) => ({
        ...e,
        event_date: e.event_date
          ? e.event_date.toISOString().slice(0, 10)
          : null,
      })),
      nominees: nominees.map((n) => ({
        ...n,
        passphrase_set_at: n.passphrase_set_at?.toISOString() ?? null,
      })),
    };
  });
}

export async function updateDisplayName(
  session: Session,
  display_name: string,
): Promise<void> {
  const name = display_name.trim();
  if (!name) throw new Error("missing_name");
  await withRls(session.user_id, session.role, async (tx) => {
    await tx`UPDATE users SET display_name = ${name} WHERE id = ${session.user_id}`;
    await tx`
      UPDATE people SET display_name = ${name}
       WHERE vault_id = ${session.vault_id} AND relation = 'self'
    `;
  });
}

export async function deleteLifeEvent(
  session: Session,
  id: string,
): Promise<boolean> {
  return withRls(session.user_id, session.role, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      DELETE FROM life_events
       WHERE id = ${id} AND vault_id = ${session.vault_id}
       RETURNING id
    `;
    return rows.length > 0;
  });
}

void sql;

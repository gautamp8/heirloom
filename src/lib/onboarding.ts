import argon2 from "argon2";
import { withRls, vec } from "./db";
import { embedOne } from "./embed";
import { syncIdentityIndexForSession } from "./identity-index";
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
        (SELECT CAST(COUNT(*) AS INTEGER) FROM life_events l WHERE l.vault_id = v.id) AS life_events_count,
        (SELECT CAST(COUNT(*) AS INTEGER) FROM nominees n WHERE n.vault_id = v.id) AS nominees_count,
        (SELECT CAST(COUNT(*) AS INTEGER) FROM sealed_letters s WHERE s.vault_id = v.id) AS sealed_letters_count
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

/** Update the creator's display name and/or reference selfie
 *  embedding. At least one must be present. */
export async function saveSelf(
  session: Session,
  opts: {
    display_name?: string;
    face_embedding?: number[]; // 128-dim from face-api.js
  },
): Promise<void> {
  const name = opts.display_name?.trim();
  const faceVec =
    opts.face_embedding && opts.face_embedding.length === 128
      ? vec(opts.face_embedding)
      : null;

  await withRls(session.user_id, session.role, async (tx) => {
    if (name) {
      await tx`UPDATE users SET display_name = ${name} WHERE id = ${session.user_id}`;
    }

    // One self-person per vault. Upsert by relation='self'.
    const [existing] = await tx<{ id: string }[]>`
      SELECT id FROM people WHERE vault_id = ${session.vault_id} AND relation = 'self'
    `;
    if (existing) {
      if (name && faceVec) {
        await tx`
          UPDATE people SET display_name = ${name},
                            reference_embedding = ${faceVec},
                            confirmed = TRUE
           WHERE id = ${existing.id}
        `;
      } else if (faceVec) {
        await tx`
          UPDATE people SET reference_embedding = ${faceVec},
                            confirmed = TRUE
           WHERE id = ${existing.id}
        `;
      } else if (name) {
        await tx`
          UPDATE people SET display_name = ${name} WHERE id = ${existing.id}
        `;
      }
    } else if (name) {
      if (faceVec) {
        await tx`
          INSERT INTO people (vault_id, display_name, relation, user_id,
                              reference_embedding, confirmed)
          VALUES (${session.vault_id}, ${name}, 'self', ${session.user_id},
                  ${faceVec}, TRUE)
        `;
      } else {
        await tx`
          INSERT INTO people (vault_id, display_name, relation, user_id, confirmed)
          VALUES (${session.vault_id}, ${name}, 'self', ${session.user_id}, TRUE)
        `;
      }
    }
  });
  await syncIdentityIndexForSession(session);
}

/** Each event's label+description is embedded so letter conditions can
 *  semantic-match against it. Idempotent: an existing row with the same
 *  (kind, label) is updated in place rather than duplicated. */
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

  const enriched = await Promise.all(
    events.map(async (e) => {
      const text = [e.label, e.description].filter(Boolean).join(". ");
      const emb = text ? await embedOne(text) : null;
      return { ...e, embedding: emb };
    }),
  );

  let written = 0;
  await withRls(session.user_id, session.role, async (tx) => {
    for (const e of enriched) {
      const embVec = e.embedding ? vec(e.embedding) : null;
      const existing = await tx<{ id: string }[]>`
        SELECT id FROM life_events
         WHERE vault_id = ${session.vault_id}
           AND kind = ${e.kind}
           AND lower(label) = lower(${e.label})
         LIMIT 1
      `;
      if (existing[0]) {
        await tx`
          UPDATE life_events
             SET event_date = ${e.event_date ?? null},
                 recurrence = ${e.recurrence ?? null},
                 description = ${e.description ?? null},
                 embedding = ${embVec}
           WHERE id = ${existing[0].id}
        `;
      } else {
        await tx`
          INSERT INTO life_events
            (vault_id, kind, label, event_date, recurrence, description, embedding)
          VALUES
            (${session.vault_id}, ${e.kind}, ${e.label},
             ${e.event_date ?? null}, ${e.recurrence ?? null},
             ${e.description ?? null},
             ${embVec})
        `;
      }
      written += 1;
    }
  });
  await syncIdentityIndexForSession(session);
  return written;
}

/** Each nominee is also mirrored into `people` so face recognition can
 *  cluster them, and a birthday life_event is added when supplied. */
export type SavedNominee = {
  id: string;
  name: string;
  passphrase: string; // plaintext - caller shows ONCE then drops
};

export async function saveNominees(
  session: Session,
  nominees: {
    name: string;
    relation?: string | null;
    email?: string | null;
    birthday?: string | null;
    face_embedding?: number[] | null; // 128-dim from face-api.js
  }[],
): Promise<{ inserted: number; nominees: SavedNominee[] }> {
  if (nominees.length === 0) return { inserted: 0, nominees: [] };

  let inserted = 0;
  const out: SavedNominee[] = [];

  // Pre-hash outside the transaction so we don't hold a long-running
  // tx open across argon2 hashing.
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
      const cleanName = n.name.trim();
      const cleanRelation = n.relation?.trim() ?? null;
      const cleanEmail = n.email?.trim() ?? null;

      // Idempotent: re-saving the same nominee updates the existing row
      // (and rotates the passphrase) rather than inserting a duplicate.
      const existing = await tx<{ id: string }[]>`
        SELECT id FROM nominees
         WHERE vault_id = ${session.vault_id}
           AND lower(name) = lower(${cleanName})
         LIMIT 1
      `;
      let nomineeId: string;
      if (existing[0]) {
        await tx`
          UPDATE nominees
             SET relationship = ${cleanRelation},
                 email = ${cleanEmail},
                 passphrase_hash = ${passphrase_hash},
                 passphrase_set_at = now()
           WHERE id = ${existing[0].id}
        `;
        nomineeId = existing[0].id;
      } else {
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO nominees (vault_id, name, relationship, email,
                                passphrase_hash, passphrase_set_at)
          VALUES (${session.vault_id}, ${cleanName},
                  ${cleanRelation}, ${cleanEmail},
                  ${passphrase_hash}, now())
          RETURNING id
        `;
        nomineeId = row.id;
        inserted += 1;
      }
      out.push({ id: nomineeId, name: cleanName, passphrase });

      // Mirror into people, idempotent by nominee_id; carry through
      // any reference face_embedding so face recognition can name them.
      const faceVec =
        Array.isArray(n.face_embedding) && n.face_embedding.length === 128
          ? vec(n.face_embedding)
          : null;
      const [existingPerson] = await tx<{ id: string }[]>`
        SELECT id FROM people WHERE nominee_id = ${nomineeId} LIMIT 1
      `;
      let personId: string;
      if (existingPerson) {
        personId = existingPerson.id;
        if (faceVec) {
          await tx`
            UPDATE people
               SET reference_embedding = ${faceVec},
                   confirmed = TRUE
             WHERE id = ${existingPerson.id}
          `;
        }
      } else {
        const [row] = faceVec
          ? await tx<{ id: string }[]>`
              INSERT INTO people
                (vault_id, display_name, relation, nominee_id,
                 reference_embedding, confirmed)
              VALUES (${session.vault_id}, ${cleanName},
                      ${cleanRelation ?? 'nominee'}, ${nomineeId},
                      ${faceVec}, TRUE)
              RETURNING id
            `
          : await tx<{ id: string }[]>`
              INSERT INTO people
                (vault_id, display_name, relation, nominee_id)
              VALUES (${session.vault_id}, ${cleanName},
                      ${cleanRelation ?? 'nominee'}, ${nomineeId})
              RETURNING id
            `;
        personId = row.id;
      }

      if (n.birthday) {
        const text = `${cleanName}'s birthday`;
        const [existingBday] = await tx<{ id: string }[]>`
          SELECT id FROM life_events
           WHERE vault_id = ${session.vault_id}
             AND kind = 'birth'
             AND subject_person_id = ${personId}
           LIMIT 1
        `;
        if (existingBday) {
          await tx`
            UPDATE life_events
               SET event_date = ${n.birthday},
                   recurrence = 'yearly',
                   label = ${text}
             WHERE id = ${existingBday.id}
          `;
        } else {
          const emb = await embedOne(text);
          await tx`
            INSERT INTO life_events
              (vault_id, kind, label, event_date, recurrence,
               subject_person_id, embedding)
            VALUES
              (${session.vault_id}, 'birth', ${text}, ${n.birthday}, 'yearly',
               ${personId}, ${vec(emb)})
          `;
        }
      }
    }
  });
  await syncIdentityIndexForSession(session);
  return { inserted, nominees: out };
}

/** Each draft becomes a note capture plus a `sealed_letters` row
 *  holding the trigger DSL and intent embedding. */
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

    // Embed the intent (occasion + trigger), not the body, so
    // semantic-match unlocks key off what the letter is FOR.
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

      const [cap] = await tx<{ id: string }[]>`
        INSERT INTO captures (vault_id, kind, status, body, title)
        VALUES (${session.vault_id}, 'note', 'ready',
                ${d.body.trim()},
                ${d.occasion_prompt.slice(0, 80)})
        RETURNING id
      `;

      // semantic_match against the intent embedding, with a
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
           ${d.occasion_prompt}, ${vec(intent_vec)},
           ${tx.json(conditions)})
      `;
      inserted += 1;
    });
  }
  if (inserted > 0) await syncIdentityIndexForSession(session);
  return { inserted };
}

export async function markOnboarded(session: Session): Promise<void> {
  await withRls(session.user_id, session.role, async (tx) => {
    await tx`
      UPDATE vaults SET onboarded_at = now()
       WHERE id = ${session.vault_id} AND onboarded_at IS NULL
    `;
  });
  await syncIdentityIndexForSession(session);
}

/** Regenerate a nominee's passphrase. The previous one is unrecoverable
 *  (only its argon2id hash was stored). The new plaintext is returned
 *  ONCE - surface it to the creator immediately. */
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
    has_photo: boolean;
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
        has_photo: boolean;
      }[]
    >`
      SELECT n.id, n.name, n.relationship, n.email,
             (n.passphrase_hash IS NOT NULL) AS has_passphrase,
             n.passphrase_set_at,
             EXISTS (
               SELECT 1 FROM people p
                WHERE p.nominee_id = n.id
                  AND p.reference_embedding IS NOT NULL
             ) AS has_photo
        FROM nominees n
       WHERE n.vault_id = ${session.vault_id}
       ORDER BY n.created_at ASC
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
  await syncIdentityIndexForSession(session);
}

export async function deleteLifeEvent(
  session: Session,
  id: string,
): Promise<boolean> {
  const removed = await withRls(session.user_id, session.role, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      DELETE FROM life_events
       WHERE id = ${id} AND vault_id = ${session.vault_id}
       RETURNING id
    `;
    return rows.length > 0;
  });
  if (removed) await syncIdentityIndexForSession(session);
  return removed;
}

import type { Sql } from "postgres";
import { withRls, vec } from "./db";
import { embedAll } from "./embed";
import { chunkText } from "./chunking";
import type { Session } from "./auth";

/**
 * Identity index — synthesizes a hidden "profile" capture per vault
 * carrying biographical facts (creator's name, life events, nominees,
 * sealed-letter occasions) so retrieval can answer questions like
 * "who is X?" or "when were you born?" without the creator having to
 * write those things into a real note themselves.
 *
 * Idempotent: deletes any prior profile capture+chunks for the vault
 * and re-inserts a fresh one each call. Cheap enough to invoke after
 * every onboarding/settings save.
 *
 * The capture is hidden from timeline/album/home listings by
 * `is_profile = true`; nominees can read its chunks via the
 * `nominee_chunks` RLS policy added in migration 006.
 */

const PROFILE_TITLE = "About this archive";

export type IdentityFacts = {
  creator: { display_name: string };
  life_events: {
    kind: string;
    label: string;
    event_date: string | null;
    recurrence: "yearly" | "once" | null;
    description: string | null;
  }[];
  nominees: {
    name: string;
    relationship: string | null;
    letter_body: string | null;
  }[];
  sealed_letters: {
    occasion_prompt: string;
    to_nominee_name: string | null;
  }[];
};

/** Build the prose that becomes the profile capture's body. The shape
 *  matters less than the *coverage* — each fact should appear at least
 *  once in natural language so embeddings have something to match. */
export function renderIdentityProse(f: IdentityFacts): string {
  const name = f.creator.display_name.trim() || "the creator";
  const first = name.split(" ")[0];
  const parts: string[] = [];

  // Identity block — phrased multiple ways so short queries
  // ("who's X?", "tell me about X") have several embedding surfaces
  // to match against. Embeddings score short queries against the
  // *closest* paragraph, so redundancy is the point.
  parts.push(
    [
      `Who is ${name}? ${name} is the person whose archive this is.`,
      `${name} is the creator and the author of every memory preserved here.`,
      `If you are wondering who ${first} is, this archive belongs to ${name}.`,
      `My name is ${name}. I am the one speaking through these memories.`,
      `This is ${name}'s archive — a record of ${first}'s life, voice, and intentions.`,
    ].join(" "),
  );

  if (f.life_events.length > 0) {
    const lines: string[] = [
      `These are the important dates and anchors in ${name}'s life — the days ${first} would want remembered:`,
    ];
    for (const e of f.life_events) {
      const date = e.event_date ? ` on ${formatDate(e.event_date)}` : "";
      const recur =
        e.recurrence === "yearly" ? " (returns each year)" : "";
      const desc = e.description ? ` — ${e.description.trim()}` : "";
      lines.push(`- ${e.label.trim()}${date}${recur}${desc}`);
    }
    lines.push(
      `If you ask when ${first} was born, when ${first} married, or when something important happened, look here.`,
    );
    parts.push(lines.join("\n"));
  }

  if (f.nominees.length > 0) {
    const lines: string[] = [
      `${name} chose the following people as nominees — the ones who will inherit this archive and the ones ${first} most wanted to reach:`,
    ];
    for (const n of f.nominees) {
      const rel = n.relationship?.trim()
        ? ` (${n.relationship.trim()})`
        : "";
      lines.push(`- ${n.name.trim()}${rel}`);
      if (n.letter_body?.trim()) {
        lines.push(
          `  ${name} left this framing for ${n.name.trim()}: ${trim(n.letter_body, 360)}`,
        );
      }
    }
    lines.push(
      `If you ask who ${first}'s nominees are, who this archive is for, or who ${first} trusted most, the people above are the answer.`,
    );
    parts.push(lines.join("\n"));
  }

  if (f.sealed_letters.length > 0) {
    const lines: string[] = [
      `${name} sealed these letters, each to be opened on a particular occasion:`,
    ];
    for (const s of f.sealed_letters) {
      const to = s.to_nominee_name?.trim()
        ? ` for ${s.to_nominee_name.trim()}`
        : "";
      lines.push(`- "${s.occasion_prompt.trim()}"${to}`);
    }
    parts.push(lines.join("\n"));
  }

  return parts.join("\n\n");
}

function trim(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Pull the identity facts for a vault directly via the provided sql
 *  client. Used by both the session-scoped path (RLS-aware) and the
 *  seed-import path (admin client, bypasses RLS). */
async function readFacts(sql: Sql, vault_id: string): Promise<IdentityFacts> {
  const [creator] = await sql<{ display_name: string }[]>`
    SELECT u.display_name FROM users u
    JOIN vaults v ON v.creator_id = u.id
    WHERE v.id = ${vault_id} LIMIT 1
  `;
  const life_events = await sql<IdentityFacts["life_events"]>`
    SELECT kind, label,
           to_char(event_date, 'YYYY-MM-DD') AS event_date,
           recurrence, description
    FROM life_events WHERE vault_id = ${vault_id}
    ORDER BY event_date NULLS LAST, label
  `;
  const nominees = await sql<IdentityFacts["nominees"]>`
    SELECT name, relationship, letter_body
    FROM nominees WHERE vault_id = ${vault_id}
    ORDER BY created_at
  `;
  const sealed = await sql<
    { occasion_prompt: string; to_nominee_name: string | null }[]
  >`
    SELECT s.occasion_prompt, n.name AS to_nominee_name
    FROM sealed_letters s
    LEFT JOIN nominees n ON n.id = s.to_nominee_id
    WHERE s.vault_id = ${vault_id}
    ORDER BY s.created_at
  `;
  return {
    creator: { display_name: creator?.display_name ?? "" },
    life_events,
    nominees,
    sealed_letters: sealed,
  };
}

/** Idempotent rebuild of the profile capture + chunks for the vault.
 *  Uses the supplied sql handle (typically an admin/superuser client)
 *  to bypass RLS — callers from API routes should use
 *  `syncIdentityIndexForSession` instead. */
export async function syncIdentityIndexAdmin(
  sql: Sql,
  vault_id: string,
): Promise<{ chunks: number }> {
  const facts = await readFacts(sql, vault_id);
  const text = renderIdentityProse(facts).trim();

  // Reset any prior profile capture for this vault — cascades clear
  // its chunks via FK ON DELETE CASCADE.
  await sql`DELETE FROM captures WHERE vault_id = ${vault_id} AND is_profile = true`;

  if (!text) return { chunks: 0 };

  const [cap] = await sql<{ id: string }[]>`
    INSERT INTO captures (vault_id, kind, status, title, body, is_profile)
    VALUES (${vault_id}, 'note', 'ready', ${PROFILE_TITLE}, ${text}, true)
    RETURNING id
  `;

  const chunks = chunkText(text);
  if (chunks.length === 0) return { chunks: 0 };
  const vectors = await embedAll(chunks.map((c) => c.text));
  for (let i = 0; i < chunks.length; i++) {
    await sql`
      INSERT INTO transcript_chunks
        (capture_id, vault_id, chunk_index, text, embedding)
      VALUES
        (${cap.id}, ${vault_id}, ${chunks[i].index},
         ${chunks[i].text}, ${vec(vectors[i])})
    `;
  }
  return { chunks: chunks.length };
}

/** Session-scoped rebuild — call after any onboarding/settings write.
 *  Runs under the caller's RLS context so it only touches their own
 *  vault. Errors are caught and logged but do not bubble: a failed
 *  resync should never block the user's primary save. */
export async function syncIdentityIndexForSession(
  session: Session,
): Promise<void> {
  try {
    await withRls(session.user_id, session.role, async (tx) => {
      // tx is a postgres.Sql; reuse the admin function with the
      // session-scoped client. Profile RLS lets the creator INSERT
      // their own profile capture because the creator_captures
      // policy keys off vault ownership.
      await syncIdentityIndexAdmin(tx as unknown as Sql, session.vault_id);
    });
  } catch (err) {
    console.error("[identity-index] sync failed", err);
  }
}

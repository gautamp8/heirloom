import type { Sql } from "postgres";
import { withRls } from "./db";
import { embedAll } from "./embed";
import { ensureVaultEmbedder } from "./embedding-guard";
import { chunkText } from "./chunking";
import type { Session } from "./auth";

/**
 * Hidden "profile" capture per vault carrying biographical facts
 * (creator name, life events, nominees, sealed-letter occasions) so
 * retrieval can answer identity questions. Idempotent; safe to call
 * after any onboarding/settings save.
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

export function renderIdentityProse(f: IdentityFacts): string {
  const name = f.creator.display_name.trim() || "the creator";
  const first = name.split(" ")[0];
  const parts: string[] = [];

  parts.push(
    [
      `Who is ${name}? ${name} is the person whose archive this is.`,
      `${name} is the creator and the author of every memory preserved here.`,
      `If you are wondering who ${first} is, this archive belongs to ${name}.`,
      `My name is ${name}. I am the one speaking through these memories.`,
      `This is ${name}'s archive - a record of ${first}'s life, voice, and intentions.`,
    ].join(" "),
  );

  if (f.life_events.length > 0) {
    const lines: string[] = [
      `These are the important dates and anchors in ${name}'s life - the days ${first} would want remembered:`,
    ];
    for (const e of f.life_events) {
      const date = e.event_date ? ` on ${formatDate(e.event_date)}` : "";
      const recur =
        e.recurrence === "yearly" ? " (returns each year)" : "";
      const desc = e.description ? ` - ${e.description.trim()}` : "";
      lines.push(`- ${e.label.trim()}${date}${recur}${desc}`);
    }
    lines.push(
      `If you ask when ${first} was born, when ${first} married, or when something important happened, look here.`,
    );
    parts.push(lines.join("\n"));
  }

  if (f.nominees.length > 0) {
    const lines: string[] = [
      `${name} chose the following people as nominees - the ones who will inherit this archive and the ones ${first} most wanted to reach:`,
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

async function readFacts(sql: Sql, vault_id: string): Promise<IdentityFacts> {
  const [creator] = await sql<{ display_name: string }[]>`
    SELECT u.display_name FROM users u
    JOIN vaults v ON v.creator_id = u.id
    WHERE v.id = ${vault_id} LIMIT 1
  `;
  const rawEvents = await sql<
    {
      kind: string;
      label: string;
      event_date: Date | string | null;
      recurrence: string | null;
      description: string | null;
    }[]
  >`
    SELECT kind, label, event_date, recurrence, description
    FROM life_events WHERE vault_id = ${vault_id}
    ORDER BY event_date NULLS LAST, label
  `;
  const life_events: IdentityFacts["life_events"] = rawEvents.map((e) => ({
    kind: e.kind,
    label: e.label,
    event_date: e.event_date
      ? e.event_date instanceof Date
        ? e.event_date.toISOString().slice(0, 10)
        : String(e.event_date).slice(0, 10)
      : null,
    recurrence:
      e.recurrence === "yearly" || e.recurrence === "once"
        ? e.recurrence
        : null,
    description: e.description,
  }));
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

/** Use with an admin sql handle that bypasses RLS (seed scripts). For
 *  request-scoped writes, prefer `syncIdentityIndexForSession`. */
export async function syncIdentityIndexAdmin(
  sql: Sql,
  vault_id: string,
): Promise<{ chunks: number }> {
  await ensureVaultEmbedder(vault_id);
  const facts = await readFacts(sql, vault_id);
  const text = renderIdentityProse(facts).trim();

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
    // Inline literal rather than the db-bound vec() fragment: this runs
    // against a caller-supplied `sql` (the seed importer's own client), and
    // a fragment bound to a different postgres instance serializes to
    // "[object Promise]" when the two aren't the same bundled copy.
    const lit = `[${vectors[i].join(",")}]`;
    await sql`
      INSERT INTO transcript_chunks
        (capture_id, vault_id, chunk_index, text, embedding)
      VALUES
        (${cap.id}, ${vault_id}, ${chunks[i].index},
         ${chunks[i].text}, ${lit}::vector)
    `;
  }
  return { chunks: chunks.length };
}

/** A failed resync must never block the user's primary save. */
export async function syncIdentityIndexForSession(
  session: Session,
): Promise<void> {
  try {
    await withRls(session.user_id, session.role, async (tx) => {
      await syncIdentityIndexAdmin(tx as unknown as Sql, session.vault_id);
    });
  } catch (err) {
    console.error("[identity-index] sync failed", err);
  }
}

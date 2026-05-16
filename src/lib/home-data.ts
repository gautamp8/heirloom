import { sqlAdmin, withRls } from "./db";
import { fireLetterConditions } from "./letter-conditions";
import type { Session } from "./auth";

export type HomeCapture = {
  id: string;
  kind: "audio" | "photo" | "note" | "video";
  status: "processing" | "ready" | "failed";
  title: string | null;
  body: string | null;
  duration_ms: number | null;
  captured_at: string;
  transcript_snippet: string | null;
};

export type ReleasedCapture = {
  id: string;
  kind: "audio" | "photo" | "note" | "video";
  title: string | null;
  body: string | null;
  duration_ms: number | null;
  captured_at: string;
  released_at: string;
  transcript_snippet: string | null;
};

export type CreatorHomePayload = {
  role: "creator";
  greeting: {
    time_of_day: "morning" | "afternoon" | "evening";
    display_name: string;
  };
  prompt_of_day: { id: string; text: string | null };
  recent_captures: HomeCapture[];
  stats: { captures: number; nominees: number };
};

export type NomineeHomePayload = {
  role: "nominee";
  framing: {
    from_name: string;
    to_name: string;
    letter_body: string | null;
  };
  released_captures: ReleasedCapture[];
  newly_fired_letters: {
    letter_id: string;
    capture_id: string;
    occasion_prompt: string;
    trigger: string;
  }[];
  daily_memory: ReleasedCapture | null;
  themed_albums: { theme: string; count: number; cover_id: string }[];
  stats: { captures: number };
};

export type HomePayload = CreatorHomePayload | NomineeHomePayload;

function timeOfDay(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function dailyMemoryIndex(seed: string, n: number): number {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${today}:${seed}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % n;
}

function asISO(v: Date | string | null | undefined): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString();
  return v;
}

export async function getHomePayload(session: Session): Promise<HomePayload> {
  if (session.role === "creator") {
    const data = await withRls(session.user_id, session.role, async (tx) => {
      const [user] = await tx<{ display_name: string }[]>`
        SELECT display_name FROM users WHERE id = ${session.user_id}
      `;
      const recent = await tx<
        {
          id: string;
          kind: "audio" | "photo" | "note" | "video";
          status: "processing" | "ready" | "failed";
          title: string | null;
          body: string | null;
          duration_ms: number | null;
          captured_at: Date | string;
          transcript_snippet: string | null;
        }[]
      >`
        SELECT c.id, c.kind, c.status, c.title, c.body, c.duration_ms, c.captured_at,
               substr(COALESCE(c.body, t.text, ''), 1, 240) AS transcript_snippet
        FROM captures c
        LEFT JOIN transcripts t ON t.capture_id = c.id
        WHERE c.vault_id = ${session.vault_id}
          AND c.is_profile = false
        ORDER BY c.captured_at DESC
        LIMIT 12
      `;
      const [counts] = await tx<{ captures: number; nominees: number }[]>`
        SELECT
          (SELECT CAST(COUNT(*) AS INTEGER) FROM captures WHERE vault_id = ${session.vault_id} AND is_profile = false) AS captures,
          (SELECT CAST(COUNT(*) AS INTEGER) FROM nominees WHERE vault_id = ${session.vault_id}) AS nominees
      `;
      return { user, recent, counts };
    });

    return {
      role: "creator",
      greeting: {
        time_of_day: timeOfDay(),
        display_name: data.user.display_name,
      },
      prompt_of_day: { id: "pending", text: null },
      recent_captures: data.recent.map((r) => ({
        ...r,
        captured_at: asISO(r.captured_at),
      })),
      stats: data.counts,
    };
  }

  const newlyFired = await fireLetterConditions(session, {
    trigger_kind: "calendar",
  });

  const data = await withRls(session.user_id, session.role, async (tx) => {
    const releases = await tx<
      {
        id: string;
        kind: "audio" | "photo" | "note" | "video";
        title: string | null;
        body: string | null;
        caption: string | null;
        duration_ms: number | null;
        captured_at: Date | string;
        released_at: Date | string;
        transcript_snippet: string | null;
      }[]
    >`
      SELECT c.id, c.kind, c.title, c.body, c.caption, c.duration_ms, c.captured_at,
             nr.released_at,
             substr(COALESCE(c.body, t.text, c.caption, ''), 1, 240) AS transcript_snippet
      FROM captures c
      JOIN nominee_releases nr ON nr.capture_id = c.id
      JOIN nominees n ON n.id = nr.nominee_id
      LEFT JOIN transcripts t ON t.capture_id = c.id
      WHERE n.user_id = ${session.user_id}
        AND nr.released_at IS NOT NULL
        AND nr.released_at <= now()
        AND c.is_profile = false
      ORDER BY c.captured_at DESC
      LIMIT 50
    `;
    const themes = await tx<{ theme: string; count: number; cover_id: string }[]>`
      WITH release_caps AS (
        SELECT c.id
          FROM captures c
          JOIN nominee_releases nr ON nr.capture_id = c.id
          JOIN nominees n ON n.id = nr.nominee_id
         WHERE n.user_id = ${session.user_id}
           AND nr.released_at IS NOT NULL
           AND nr.released_at <= now()
      )
      SELECT ct.value AS theme, CAST(COUNT(*) AS INTEGER) AS count,
             (SELECT ct2.capture_id
                FROM capture_tags ct2
                JOIN release_caps r2 ON r2.id = ct2.capture_id
               WHERE ct2.kind = 'topic' AND ct2.value = ct.value
               LIMIT 1) AS cover_id
        FROM capture_tags ct
        JOIN release_caps r ON r.id = ct.capture_id
       WHERE ct.kind = 'topic'
       GROUP BY ct.value
      HAVING COUNT(*) >= 2
       ORDER BY count DESC, theme ASC
       LIMIT 6
    `;
    return { releases, themes };
  });

  const normalized: ReleasedCapture[] = data.releases.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    duration_ms: r.duration_ms,
    captured_at: asISO(r.captured_at),
    released_at: asISO(r.released_at),
    transcript_snippet: r.transcript_snippet,
  }));

  const dailyMemory =
    normalized.length > 0
      ? normalized[
          dailyMemoryIndex(session.user_id + session.vault_id, normalized.length)
        ]
      : null;

  if (!sqlAdmin) throw new Error("admin_db_unavailable");
  const [framing] = await sqlAdmin<
    { creator_name: string; nominee_name: string; letter_body: string | null }[]
  >`
    SELECT u_creator.display_name AS creator_name,
           u_nominee.display_name AS nominee_name,
           n.letter_body
    FROM nominees n
    JOIN vaults v ON v.id = n.vault_id
    JOIN users u_creator ON u_creator.id = v.creator_id
    JOIN users u_nominee ON u_nominee.id = n.user_id
    WHERE n.user_id = ${session.user_id}
      AND n.vault_id = ${session.vault_id}
    LIMIT 1
  `;

  return {
    role: "nominee",
    framing: {
      from_name: framing?.creator_name ?? "the creator",
      to_name: framing?.nominee_name ?? "",
      letter_body: framing?.letter_body ?? null,
    },
    released_captures: normalized,
    newly_fired_letters: newlyFired,
    daily_memory: dailyMemory,
    themed_albums: data.themes,
    stats: { captures: normalized.length },
  };
}

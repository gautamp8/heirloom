/**
 * Thin HTTP client for driving a live Heirloom instance's reflection
 * endpoint from tests and eval runners. Targets TEST_BASE_URL (default
 * http://127.0.0.1:3000) — a dev server or the demo host, seeded with the
 * Sagan archive.
 */

export const BASE_URL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";

export const SAGAN_PASSPHRASE = "carl sagan archive 1990";

export type SseEvent = { name: string; data: Record<string, unknown> };

export type ReflectOutcome = {
  events: SseEvent[];
  /** Final answer text (the `answer` event; empty string if none). */
  answer: string;
  /** True when the final grounded state was affirmative. */
  grounded: boolean;
  hitCount: number;
  topSimilarity: number;
  claims: { text: string; citations: { capture_id: string }[] }[];
  rejectedFor: string | null;
};

export async function nomineeCookie(
  passphrase = SAGAN_PASSPHRASE,
): Promise<string> {
  const r = await fetch(`${BASE_URL}/api/auth/nominee-passphrase`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
  if (!r.ok) throw new Error(`nominee login failed: ${r.status}`);
  const setCookie = r.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/heirloom_session=[^;]+/);
  if (!m) throw new Error("no session cookie in login response");
  return m[0];
}

/** Dev-only bootstrap; used by attacks that need to create captures. */
export async function creatorCookie(): Promise<string> {
  const r = await fetch(`${BASE_URL}/api/dev/bootstrap`, { method: "POST" });
  if (!r.ok) throw new Error(`creator bootstrap failed: ${r.status}`);
  const setCookie = r.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/heirloom_session=[^;]+/);
  if (!m) throw new Error("no session cookie in bootstrap response");
  return m[0];
}

function parseSse(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const block of raw.split("\n\n")) {
    const nameLine = block.split("\n").find((l) => l.startsWith("event: "));
    const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
    if (!nameLine || !dataLine) continue;
    try {
      events.push({
        name: nameLine.slice(7).trim(),
        data: JSON.parse(dataLine.slice(6)),
      });
    } catch {
      /* skip malformed frame */
    }
  }
  return events;
}

export async function reflect(
  question: string,
  cookie: string,
  timeoutMs = 240_000,
): Promise<ReflectOutcome> {
  const r = await fetch(`${BASE_URL}/api/reflect`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`reflect http ${r.status}`);
  const raw = await r.text();
  const events = parseSse(raw);

  const answer =
    (events.findLast((e) => e.name === "answer")?.data.text as string) ?? "";
  // The last grounded event wins: the route may send grounded:true then
  // collapse to grounded:false after post-synthesis checks.
  const grounded =
    (events.findLast((e) => e.name === "grounded")?.data.grounded as boolean) ??
    false;
  const retrieved = events.find((e) => e.name === "retrieved")?.data ?? {};
  const claims = events
    .filter((e) => e.name === "claim")
    .map((e) => e.data as ReflectOutcome["claims"][number]);

  return {
    events,
    answer,
    grounded,
    hitCount: (retrieved.hit_count as number) ?? 0,
    topSimilarity: (retrieved.top_similarity as number) ?? 0,
    claims,
    rejectedFor: null,
  };
}

/** Create a note capture and wait for the pipeline to finish. */
export async function createNote(
  cookie: string,
  body: string,
  title?: string,
): Promise<string> {
  const r = await fetch(`${BASE_URL}/api/capture`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ kind: "note", body, title }),
  });
  if (!r.ok) throw new Error(`capture failed: ${r.status} ${await r.text()}`);
  const { capture_id: id } = (await r.json()) as { capture_id: string };

  // Poll the status stream until ready (SSE; simplest is re-request until
  // the stream contains a ready event).
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const s = await fetch(`${BASE_URL}/api/capture/${id}/status`, {
      headers: { cookie },
    });
    const text = await s.text();
    if (text.includes("ready")) return id;
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error(`capture ${id} never became ready`);
}

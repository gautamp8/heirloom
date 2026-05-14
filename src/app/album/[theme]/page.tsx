import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { withRls } from "@/lib/db";

export const dynamic = "force-dynamic";

type CaptureRow = {
  id: string;
  kind: "audio" | "photo" | "note" | "video";
  title: string | null;
  body: string | null;
  caption: string | null;
  duration_ms: number | null;
  captured_at: Date;
  snippet: string | null;
};

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ theme: string }>;
}) {
  const session = await readSession();
  if (!session) redirect("/portal");
  const { theme: raw } = await params;
  const theme = decodeURIComponent(raw);

  const rows = await withRls(session.user_id, session.role, async (tx) => {
    if (session.role === "creator") {
      return tx<CaptureRow[]>`
        SELECT c.id, c.kind, c.title, c.body, c.caption, c.duration_ms,
               c.captured_at,
               substr(COALESCE(c.body, t.text, c.caption, ''), 1, 240) AS snippet
          FROM captures c
          JOIN capture_tags ct ON ct.capture_id = c.id
          LEFT JOIN transcripts t ON t.capture_id = c.id
         WHERE c.vault_id = ${session.vault_id}
           AND ct.kind = 'topic'
           AND lower(ct.value) = lower(${theme})
         ORDER BY c.captured_at DESC
      `;
    }
    return tx<CaptureRow[]>`
      SELECT c.id, c.kind, c.title, c.body, c.caption, c.duration_ms,
             c.captured_at,
             substr(COALESCE(c.body, t.text, c.caption, ''), 1, 240) AS snippet
        FROM captures c
        JOIN capture_tags ct ON ct.capture_id = c.id
        JOIN nominee_releases nr ON nr.capture_id = c.id
        JOIN nominees n ON n.id = nr.nominee_id
        LEFT JOIN transcripts t ON t.capture_id = c.id
       WHERE n.user_id = ${session.user_id}
         AND nr.released_at IS NOT NULL
         AND nr.released_at <= now()
         AND ct.kind = 'topic'
         AND lower(ct.value) = lower(${theme})
       ORDER BY c.captured_at DESC
    `;
  });

  return (
    <main className="stage relative min-h-dvh px-6 pt-8 pb-16">
      <div className="max-w-[680px] mx-auto relative z-10">
        <Link
          href="/"
          className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted hover:text-ink"
        >
          ← Home
        </Link>
        <p className="eyebrow mt-4 mb-1">Theme</p>
        <h1 className="h-title mb-2 capitalize">
          <em>{theme}</em>
        </h1>
        <p className="p-body mb-8 max-w-[480px]">
          {rows.length === 0
            ? "Nothing yet in this theme."
            : `${rows.length} ${rows.length === 1 ? "piece" : "pieces"} tagged with this theme.`}
        </p>

        <ul className="flex flex-col">
          {rows.map((c) => (
            <li
              key={c.id}
              className="flex items-start gap-3 py-4 border-b border-rule"
            >
              {c.kind === "photo" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/blob/${c.id}`}
                  alt=""
                  className="w-12 h-12 rounded-[10px] object-cover flex-shrink-0 bg-paper-2"
                  loading="lazy"
                />
              ) : (
                <span
                  aria-hidden
                  className="w-12 h-12 rounded-[10px] grid place-items-center bg-paper-2 text-wax flex-shrink-0 font-mono text-[10px] tracking-[0.12em] uppercase"
                >
                  {c.kind.slice(0, 2)}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-muted">
                  {new Date(c.captured_at).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                {c.title && (
                  <p className="font-serif text-[16px] leading-tight text-ink mt-0.5">
                    {c.title}
                  </p>
                )}
                {c.snippet && (
                  <p className="font-serif italic text-[14px] leading-[1.45] text-ink-soft mt-1.5 text-wrap-pretty">
                    {c.snippet}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

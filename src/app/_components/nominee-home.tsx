"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import type { ReleasedCapture } from "../page";

export function NomineeHome(props: {
  framing: { from_name: string; to_name: string; letter_body: string | null };
  released: ReleasedCapture[];
  stats: { captures: number };
}) {
  const [latest, ...rest] = props.released;
  const hasArchive = props.released.length > 0;

  return (
    <section className="px-6 pt-2 pb-32 relative z-10 flex-1">
      {/* Framing strip */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
        className="mt-2 rounded-[14px] border border-rule-soft bg-bg-raised p-4 flex items-center gap-3"
      >
        <Image
          src="/seal.png"
          alt=""
          aria-hidden
          width={36}
          height={36}
          className="w-9 h-9 object-contain flex-shrink-0"
        />
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
            From {props.framing.from_name}
          </p>
          <p className="font-serif italic text-[16px] leading-tight text-ink mt-0.5 truncate">
            {props.framing.letter_body
              ? firstClause(props.framing.letter_body)
              : `For ${props.framing.to_name}`}
          </p>
        </div>
      </motion.div>

      {!hasArchive ? (
        <p className="p-body mt-12 text-ink-muted">
          Your archive is ready. The first piece will appear here.
        </p>
      ) : (
        <>
          {/* Latest unlocked hero */}
          {latest && <LatestHero capture={latest} />}

          {/* Earlier pieces */}
          {rest.length > 0 && (
            <>
              <h3 className="mt-10 mb-3 font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted font-medium flex items-center justify-between">
                <span>Earlier pieces</span>
                <span className="text-ink-fade">{rest.length}</span>
              </h3>
              <ul className="flex flex-col">
                {rest.map((c) => (
                  <ReleasedRow key={c.id} cap={c} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {/* Floating Reflection pill — the killer surface for nominees */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
        className="fixed bottom-6 left-0 right-0 flex justify-center pointer-events-none z-20"
      >
        <Link
          href="/reflect"
          className="pointer-events-auto rounded-full px-6 py-3 text-paper bg-ink font-serif italic text-[15px] shadow-paper-3 hover:bg-wax transition-colors"
        >
          Ask the archive a question
        </Link>
      </motion.div>
    </section>
  );
}

function LatestHero({ capture }: { capture: ReleasedCapture }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
      className="mt-6 rounded-[14px] border border-rule p-5 bg-bg-raised"
      style={{ boxShadow: "0 0 0 1px rgba(31,27,20,0.02)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          aria-hidden
          className="inline-block w-[3px] h-[14px] rounded-sm bg-wax"
          style={{ opacity: 0.7 }}
        />
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-wax">
          Latest unlocked
        </span>
      </div>
      <p className="p-meta">
        {formatLongDate(new Date(capture.captured_at))} ·{" "}
        {capture.kind === "audio"
          ? "Voice"
          : capture.kind === "note"
            ? "Note"
            : capture.kind}
      </p>
      {capture.transcript_snippet && (
        <p className="font-serif text-[18px] leading-[1.55] text-ink mt-3 text-wrap-pretty">
          {smartSnippet(capture.transcript_snippet)}
        </p>
      )}
      {capture.kind === "audio" && (
        <div className="mt-4 flex items-center gap-3">
          <button
            className="w-9 h-9 rounded-full grid place-items-center bg-ink text-paper"
            aria-label="Play original recording"
            disabled
            title="Player coming next"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2 1.5 10 6 2 10.5z" />
            </svg>
          </button>
          <p className="p-meta">
            Recording · {formatDuration(capture.duration_ms ?? 0)}
          </p>
        </div>
      )}
    </motion.article>
  );
}

function ReleasedRow({ cap }: { cap: ReleasedCapture }) {
  const time = formatLongDate(new Date(cap.captured_at));
  const isAudio = cap.kind === "audio";
  return (
    <li className="flex items-start gap-3 py-3 border-b border-rule">
      <span
        aria-hidden
        className="w-10 h-10 rounded-[10px] grid place-items-center bg-paper-2 text-wax flex-shrink-0"
      >
        {isAudio ? (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="2" width="6" height="11" rx="3" />
            <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 3.5h9l3 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z" />
            <path d="M13 3.5v3h3M6 9.5h8M6 12.5h8M6 15.5h5" />
          </svg>
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className="cap-time font-mono text-[9px] tracking-[0.12em] uppercase text-ink-muted">
          {time}
        </p>
        {cap.transcript_snippet && (
          <p className="font-serif italic text-[14px] leading-[1.45] text-ink-soft mt-1 text-wrap-pretty">
            {smartSnippet(cap.transcript_snippet)}
          </p>
        )}
      </div>
    </li>
  );
}

function firstClause(text: string): string {
  const flat = text.replace(/\s*\n\s*/g, " ").trim();
  const m = flat.match(/^[^.!?]{4,90}[.!?]?/);
  return (m?.[0] ?? flat.slice(0, 90)).trim();
}

function smartSnippet(text: string, max = 180): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function formatLongDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(ms: number): string {
  if (!ms) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

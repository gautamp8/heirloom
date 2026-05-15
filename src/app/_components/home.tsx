"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CaptureSheet } from "./capture-sheet";
import { SpeakButton } from "./speak-button";
import type { HomeCapture } from "../page";

const TOD_LABELS: Record<"morning" | "afternoon" | "evening", string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

export function Home(props: {
  greeting: { time_of_day: "morning" | "afternoon" | "evening"; display_name: string };
  prompt: { id: string; text: string | null };
  recent: HomeCapture[];
  stats: { captures: number; nominees: number };
}) {
  const [sheet, setSheet] = useState<{
    mode: "voice" | "note" | "photo";
    prompt?: string;
  } | null>(null);
  const [recent, setRecent] = useState(props.recent);
  const [prompt, setPrompt] = useState<string | null>(props.prompt.text);
  const [shuffling, setShuffling] = useState(false);
  const [draftCount, setDraftCount] = useState(0);

  // Fetch the prompt of day async so the home paints before Gemma replies.
  useEffect(() => {
    if (prompt !== null) return;
    let cancelled = false;
    setShuffling(true);
    (async () => {
      try {
        const r = await fetch("/api/prompt/shuffle");
        if (r.ok) {
          const d = (await r.json()) as { text: string };
          if (!cancelled && d.text) setPrompt(d.text);
        }
      } finally {
        if (!cancelled) setShuffling(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Surface any local drafts that didn't make it to the server.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { countDrafts } = await import("@/lib/drafts");
        const n = await countDrafts();
        if (!cancelled) setDraftCount(n);
      } catch {
        /* IndexedDB unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recent.length]);

  async function shufflePrompt() {
    setShuffling(true);
    try {
      const r = await fetch("/api/prompt/shuffle");
      if (r.ok) {
        const d = (await r.json()) as { text: string };
        if (d.text) setPrompt(d.text);
      }
    } finally {
      setShuffling(false);
    }
  }

  return (
    <>
      <section className="px-6 pt-2 relative z-10 flex-1">
        {/* Greeting */}
        <p className="p-meta">{todayLong()}</p>
        <h1 className="font-serif font-normal text-[34px] leading-[1.05] tracking-[-0.01em] mt-1.5 text-ink">
          {TOD_LABELS[props.greeting.time_of_day]},
          <em
            className="italic text-wax"
            style={{ marginLeft: "0.28em", letterSpacing: "0.005em" }}
          >
            {props.greeting.display_name}
          </em>
        </h1>

        {/* A place to begin */}
        <article className="mt-5 rounded-[14px] border border-rule p-5 bg-paper-2 relative">
          <div className="flex items-center justify-between mb-2.5">
            <p className="p-meta">A place to begin</p>
            <button
              type="button"
              onClick={shufflePrompt}
              disabled={shuffling}
              aria-label="Suggest another"
              className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted hover:text-ink disabled:opacity-50 flex items-center gap-1 transition-colors"
            >
              {shuffling ? "Listening…" : "Another"}
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transformOrigin: "center",
                  animation: shuffling ? "spin 1.4s linear infinite" : "none",
                }}
              >
                <path d="M2.5 8a5.5 5.5 0 1 0 1.3-3.55" />
                <path d="M2.5 2v3h3" />
              </svg>
            </button>
          </div>
          {prompt ? (
            <p className="font-serif italic text-[21px] leading-[1.3] mb-4 text-ink tracking-[-0.005em] text-wrap-pretty">
              {prompt}
            </p>
          ) : (
            <p className="font-serif italic text-[21px] leading-[1.3] mb-4 text-ink-muted tracking-[-0.005em]">
              Composing a prompt for you<span className="opacity-50">…</span>
            </p>
          )}
          <div className="flex items-center gap-3.5">
            <button
              className="btn"
              onClick={() => setSheet({ mode: "voice", prompt: prompt ?? undefined })}
            >
              Speak it
            </button>
            <button
              className="btn-ghost"
              onClick={() => setSheet({ mode: "note", prompt: prompt ?? undefined })}
            >
              Or write
            </button>
          </div>
        </article>

        {/* Capture chips */}
        <h3 className="mt-7 mb-3 font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted font-medium">
          Capture
        </h3>
        <div className="grid grid-cols-2 gap-2.5">
          <CapChip
            label="Voice"
            sub="A recording"
            icon={<IconMic />}
            onClick={() => setSheet({ mode: "voice" })}
          />
          <CapChip
            label="Note"
            sub="Typed lines"
            icon={<IconNote />}
            onClick={() => setSheet({ mode: "note" })}
          />
          <CapChip
            label="Photo"
            sub="With caption"
            icon={<IconPhoto />}
            onClick={() => setSheet({ mode: "photo" })}
          />
          <CapChip label="Video" sub="Short clip" icon={<IconVideo />} disabled />
        </div>

        {/* Reflection entry */}
        <Link
          href="/reflect"
          className="mt-6 block rounded-[14px] border border-rule p-4 bg-bg-raised flex items-center justify-between hover:border-ink-muted transition-colors"
        >
          <span className="font-serif italic text-[16px] text-ink">
            Ask the archive a question
          </span>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-fade">
            Reflect →
          </span>
        </Link>

        {draftCount > 0 && (
          <p className="mt-5 font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
            {draftCount === 1
              ? "1 draft is safe in your browser"
              : `${draftCount} drafts are safe in your browser`}
          </p>
        )}

        {/* Recent */}
        <h3 className="mt-7 mb-3 font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted font-medium flex items-center justify-between">
          <span>Recent</span>
          <span className="text-ink-fade">{props.stats.captures}</span>
        </h3>
        {recent.length === 0 ? (
          <p className="p-body text-ink-muted">Begin when you&rsquo;re ready.</p>
        ) : (
          <ul className="flex flex-col">
            {recent.map((c) => (
              <CapRow key={c.id} cap={c} />
            ))}
          </ul>
        )}

        <div className="h-8" />
      </section>

      {sheet && (
        <CaptureSheet
          mode={sheet.mode}
          prompt={sheet.prompt ?? null}
          onClose={() => setSheet(null)}
          onSaved={(cap) => {
            setRecent((r) => [cap, ...r]);
            setSheet(null);
          }}
        />
      )}
    </>
  );
}

function CapChip(props: {
  label: string;
  sub: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className="cap-chip text-left rounded-[12px] border border-rule bg-bg-raised p-3.5 flex items-center gap-3 transition disabled:opacity-50 disabled:cursor-not-allowed hover:border-ink-muted hover:-translate-y-[1px]"
    >
      <span className="w-8 h-8 grid place-items-center rounded-[8px] bg-paper-2 text-wax">
        {props.icon}
      </span>
      <span className="min-w-0">
        <span className="block font-sans font-medium text-[14px] text-ink">
          {props.label}
        </span>
        <span className="block font-mono text-[9px] tracking-[0.12em] uppercase text-ink-fade mt-0.5">
          {props.sub}
        </span>
      </span>
    </button>
  );
}

function CapRow({ cap }: { cap: HomeCapture }) {
  const time = relativeTime(new Date(cap.captured_at));
  const isAudio = cap.kind === "audio";
  const isPhoto = cap.kind === "photo";
  return (
    <li className="flex items-start gap-3 py-3 border-b border-rule">
      {isPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/blob/${cap.id}`}
          alt={cap.title ?? "Photograph"}
          className="w-10 h-10 rounded-[10px] object-cover flex-shrink-0 bg-paper-2"
          loading="lazy"
        />
      ) : (
        <span
          className="w-10 h-10 rounded-[10px] grid place-items-center bg-paper-2 text-wax flex-shrink-0"
          aria-hidden
        >
          {isAudio ? <IconMic /> : cap.kind === "note" ? <IconNote /> : <IconPhoto />}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="cap-time font-mono text-[9px] tracking-[0.12em] uppercase text-ink-muted">
            {time}
          </span>
          {cap.status !== "ready" && (
            <span className="font-mono text-[9px] uppercase text-wax tracking-[0.08em]">
              {cap.status === "processing" ? "processing…" : "failed"}
            </span>
          )}
        </div>
        {cap.title && (
          <p className="font-serif text-[15px] leading-tight text-ink mt-0.5">
            {cap.title}
          </p>
        )}
        {cap.transcript_snippet && (
          <p className="font-serif italic text-[13px] leading-[1.4] text-ink-muted mt-1.5 text-wrap-pretty">
            {cap.transcript_snippet}
            {cap.transcript_snippet.length === 240 && "…"}
          </p>
        )}
        {cap.transcript_snippet && cap.status === "ready" && (
          <div className="mt-2">
            <SpeakButton text={cap.transcript_snippet} />
          </div>
        )}
      </div>
    </li>
  );
}

function todayLong(): string {
  const now = new Date();
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function IconMic() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2" width="6" height="11" rx="3" />
      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
    </svg>
  );
}
function IconNote() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 3.5h9l3 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z" />
      <path d="M13 3.5v3h3M6 9.5h8M6 12.5h8M6 15.5h5" />
    </svg>
  );
}
function IconPhoto() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="4" width="15" height="12" rx="2" />
      <circle cx="10" cy="10" r="3" />
      <path d="M6 4l1.5-1.5h5L14 4" />
    </svg>
  );
}
function IconVideo() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="5" width="11" height="10" rx="1.5" />
      <path d="M13.5 9l4-2v6l-4-2z" />
    </svg>
  );
}

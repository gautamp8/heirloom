"use client";

import { useState } from "react";
import { CaptureSheet } from "./capture-sheet";
import type { HomeCapture } from "../page";

const TOD_LABELS: Record<"morning" | "afternoon" | "evening", string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

export function Home(props: {
  greeting: { time_of_day: "morning" | "afternoon" | "evening"; display_name: string };
  prompt: { id: string; text: string };
  recent: HomeCapture[];
  stats: { captures: number; nominees: number };
}) {
  const [sheetMode, setSheetMode] = useState<"voice" | "note" | null>(null);
  const [recent, setRecent] = useState(props.recent);

  return (
    <>
      <section className="px-6 pt-2 relative z-10 flex-1">
        {/* Greeting */}
        <p className="p-meta">{todayLong()}</p>
        <h1 className="font-serif font-normal text-[34px] leading-[1.05] tracking-[-0.01em] mt-1.5 text-ink">
          {TOD_LABELS[props.greeting.time_of_day]},{" "}
          <em className="italic text-wax">{props.greeting.display_name}</em>
        </h1>

        {/* Prompt of the day */}
        <article className="prompt-card mt-5 rounded-[14px] border border-rule p-5 bg-paper-2 relative">
          <p className="p-meta">Prompt of the day</p>
          <p className="font-serif italic text-[21px] leading-[1.3] mt-2.5 mb-4 text-ink tracking-[-0.005em] text-wrap-pretty">
            {props.prompt.text}
          </p>
          <div className="flex items-center gap-3.5">
            <button
              className="btn"
              onClick={() => setSheetMode("voice")}
            >
              Speak it
            </button>
            <button
              className="btn-ghost"
              onClick={() => setSheetMode("note")}
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
            onClick={() => setSheetMode("voice")}
          />
          <CapChip
            label="Note"
            sub="Typed lines"
            icon={<IconNote />}
            onClick={() => setSheetMode("note")}
          />
          <CapChip label="Photo" sub="With caption" icon={<IconPhoto />} disabled />
          <CapChip label="Video" sub="Short clip" icon={<IconVideo />} disabled />
        </div>

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

      {sheetMode && (
        <CaptureSheet
          mode={sheetMode}
          prompt={props.prompt.text}
          onClose={() => setSheetMode(null)}
          onSaved={(cap) => {
            setRecent((r) => [cap, ...r]);
            setSheetMode(null);
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
  return (
    <li className="flex items-start gap-3 py-3 border-b border-rule">
      <span
        className="w-10 h-10 rounded-[10px] grid place-items-center bg-paper-2 text-wax flex-shrink-0"
        aria-hidden
      >
        {isAudio ? <IconMic /> : cap.kind === "note" ? <IconNote /> : <IconPhoto />}
      </span>
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

/* ---- Icons (single-weight 1.2px stroke, hand-set, matches design system) ---- */
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

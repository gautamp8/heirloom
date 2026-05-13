"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { ReleasedCapture } from "../page";

type NewlyFired = {
  letter_id: string;
  capture_id: string;
  occasion_prompt: string;
  trigger: string;
};

type Album = { theme: string; count: number; cover_id: string };

const MOOD_CHIPS = [
  "I miss you",
  "I need advice",
  "On hard days",
  "A big moment",
];

export function NomineeHome(props: {
  framing: { from_name: string; to_name: string; letter_body: string | null };
  released: ReleasedCapture[];
  newlyFired: NewlyFired[];
  dailyMemory: ReleasedCapture | null;
  albums: Album[];
  stats: { captures: number };
}) {
  const router = useRouter();
  const rest = props.released.filter(
    (c) =>
      c.id !== props.dailyMemory?.id &&
      !props.newlyFired.some((f) => f.capture_id === c.id),
  );
  const hasArchive = props.released.length > 0;

  // Look up the released capture body for any newly-fired letter so we can
  // surface its content inline without another fetch.
  const newlyFiredCards = props.newlyFired
    .map((f) => {
      const cap = props.released.find((r) => r.id === f.capture_id);
      return cap ? { fired: f, capture: cap } : null;
    })
    .filter(Boolean) as { fired: NewlyFired; capture: ReleasedCapture }[];

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

      {/* Newly-opened letters — surfaces when a sealed letter unlocked this load */}
      {newlyFiredCards.length > 0 && (
        <div className="mt-6 flex flex-col gap-4">
          {newlyFiredCards.map(({ fired, capture }) => (
            <UnlockedLetterCard
              key={fired.letter_id}
              fired={fired}
              capture={capture}
              fromName={props.framing.from_name}
            />
          ))}
        </div>
      )}

      {!hasArchive ? (
        <p className="p-body mt-12 text-ink-muted">
          Your archive is ready. The first piece will appear here.
        </p>
      ) : (
        <>
          {/* Today's memory — deterministic per nominee per day */}
          {props.dailyMemory && (
            <DailyHero capture={props.dailyMemory} />
          )}

          {/* Mood affordance — fires state triggers for sealed letters */}
          <MoodCard onUnlock={() => router.refresh()} />

          {/* Themed albums */}
          {props.albums.length > 0 && (
            <>
              <h3 className="mt-10 mb-3 font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted font-medium">
                Themes
              </h3>
              <ul className="grid grid-cols-2 gap-3">
                {props.albums.map((a) => (
                  <AlbumCard key={a.theme} album={a} />
                ))}
              </ul>
            </>
          )}

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

function DailyHero({ capture }: { capture: ReleasedCapture }) {
  const isPhoto = capture.kind === "photo";
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
      className="mt-6 rounded-[14px] border border-rule p-5 bg-bg-raised overflow-hidden"
      style={{ boxShadow: "0 0 0 1px rgba(31,27,20,0.02)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          aria-hidden
          className="inline-block w-[3px] h-[14px] rounded-sm bg-wax"
          style={{ opacity: 0.7 }}
        />
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-wax">
          Today&rsquo;s memory
        </span>
      </div>
      {isPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/blob/${capture.id}`}
          alt={capture.title ?? "Photograph"}
          className="w-full max-h-[280px] object-cover rounded-[10px] mb-4 bg-paper-2"
        />
      )}
      <p className="p-meta">
        {formatLongDate(new Date(capture.captured_at))} ·{" "}
        {capture.kind === "audio"
          ? "Voice"
          : capture.kind === "photo"
            ? "Photograph"
            : capture.kind === "note"
              ? "Note"
              : capture.kind}
      </p>
      {capture.title && (
        <p className="font-serif text-[18px] leading-tight text-ink mt-2">
          {capture.title}
        </p>
      )}
      {capture.transcript_snippet && (
        <p className="font-serif italic text-[16px] leading-[1.55] text-ink-soft mt-3 text-wrap-pretty">
          {smartSnippet(capture.transcript_snippet, 220)}
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

function MoodCard({ onUnlock }: { onUnlock: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [unlocked, setUnlocked] = useState<{ occasion: string; trigger: string }[]>([]);

  async function tap(state: string) {
    if (busy) return;
    setBusy(state);
    setUnlocked([]);
    try {
      const r = await fetch("/api/nominee/mood", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state }),
      });
      const d = (await r.json()) as {
        fired?: { occasion_prompt: string; trigger: string }[];
      };
      const fired = (d.fired ?? []).map((f) => ({
        occasion: f.occasion_prompt,
        trigger: f.trigger,
      }));
      setUnlocked(fired);
      // If anything fired, refresh to show the new release in the feed
      if (fired.length > 0) setTimeout(onUnlock, 1200);
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.5 }}
      className="mt-6 rounded-[14px] border border-rule p-4 bg-paper-2"
    >
      <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted mb-2">
        If you need it
      </p>
      <p className="font-serif italic text-[16px] text-ink mb-3">
        Tell the archive what kind of moment you&rsquo;re in.
      </p>
      <div className="flex flex-wrap gap-2">
        {MOOD_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            disabled={!!busy}
            onClick={() => tap(c)}
            className="px-3 py-1.5 rounded-full border border-rule-strong bg-bg-raised text-ink text-[13px] font-sans hover:border-ink-muted disabled:opacity-50 transition-colors"
          >
            {busy === c ? "Listening…" : c}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowInput((v) => !v)}
          className="px-3 py-1.5 rounded-full border border-dashed border-rule-strong text-ink-muted text-[13px] font-sans hover:border-ink-muted transition-colors"
        >
          {showInput ? "Cancel" : "Something else…"}
        </button>
      </div>
      {showInput && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="A few words about what's on your mind"
            maxLength={120}
            className="flex-1 font-serif italic text-[15px] text-ink bg-transparent border-b border-rule-strong outline-none py-1.5 placeholder:text-ink-muted"
          />
          <button
            className="btn"
            disabled={!text.trim() || !!busy}
            onClick={() => {
              const s = text.trim();
              setText("");
              setShowInput(false);
              if (s) tap(s);
            }}
          >
            Send
          </button>
        </div>
      )}

      <AnimatePresence>
        {unlocked.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            {unlocked.map((u, i) => (
              <p
                key={i}
                className="font-serif italic text-[15px] text-wax leading-[1.45]"
              >
                {u.occasion} — opened just for you.
              </p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function UnlockedLetterCard({
  fired,
  capture,
  fromName,
}: {
  fired: NewlyFired;
  capture: ReleasedCapture;
  fromName: string;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
      className="rounded-[14px] border-2 p-5 relative overflow-hidden"
      style={{
        borderColor: "var(--color-wax)",
        background:
          "linear-gradient(180deg, rgba(255,243,210,0.5), var(--color-bg-raised))",
        boxShadow: "var(--shadow-paper-2, 0 12px 32px -16px rgba(125,42,26,0.25))",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          aria-hidden
          className="inline-block w-2 h-2 rounded-full bg-wax animate-pulse"
        />
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-wax">
          {fromName} sealed this for you
        </span>
      </div>
      <p className="font-serif italic text-[18px] leading-[1.4] text-ink mb-2">
        {fired.occasion_prompt}
      </p>
      {capture.body && (
        <p className="font-serif text-[16px] leading-[1.6] text-ink-soft mt-3 text-wrap-pretty">
          {smartSnippet(capture.body, 320)}
        </p>
      )}
      <p className="mt-3 font-mono text-[9px] tracking-[0.18em] uppercase text-ink-fade">
        {fired.trigger}
      </p>
    </motion.article>
  );
}

function AlbumCard({ album }: { album: Album }) {
  return (
    <li>
      <Link
        href={`/album/${encodeURIComponent(album.theme)}`}
        className="block rounded-[12px] border border-rule overflow-hidden bg-bg-raised hover:border-ink-muted transition-colors"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/blob/${album.cover_id}`}
          alt={album.theme}
          className="w-full h-24 object-cover bg-paper-2"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="p-3">
          <p className="font-serif text-[15px] text-ink leading-tight capitalize">
            {album.theme}
          </p>
          <p className="font-mono text-[9px] tracking-[0.16em] uppercase text-ink-fade mt-0.5">
            {album.count} pieces
          </p>
        </div>
      </Link>
    </li>
  );
}

function ReleasedRow({ cap }: { cap: ReleasedCapture }) {
  const time = formatLongDate(new Date(cap.captured_at));
  const isAudio = cap.kind === "audio";
  const isPhoto = cap.kind === "photo";
  return (
    <li className="flex items-start gap-3 py-3 border-b border-rule">
      {isPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/blob/${cap.id}`}
          alt=""
          className="w-10 h-10 rounded-[10px] object-cover flex-shrink-0 bg-paper-2"
          loading="lazy"
        />
      ) : (
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
      )}
      <div className="flex-1 min-w-0">
        <p className="cap-time font-mono text-[9px] tracking-[0.12em] uppercase text-ink-muted">
          {time}
        </p>
        {cap.title && (
          <p className="font-serif text-[15px] leading-tight text-ink mt-0.5">
            {cap.title}
          </p>
        )}
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

"use client";

import { useEffect, useRef, useState } from "react";

type State = "hidden" | "idle" | "loading" | "playing" | "error";

/**
 * "Hear in their voice" affordance.
 *
 * If `audioUrl` is set (e.g. an audio capture's blob URL), plays the
 * creator's actual recording. Otherwise synthesizes `text` in the
 * cloned voice via /api/voice/speak.
 *
 * Verbatim contract: when falling back to TTS, callers must pass
 * exact source material from the archive (a capture body, a
 * transcript line, the verbatim snippet behind a Reflection
 * citation). Never pass Gemma-synthesized answer text.
 */
export function SpeakButton({
  text,
  audioUrl,
  variant = "small",
  label,
}: {
  text?: string;
  audioUrl?: string | null;
  variant?: "small" | "big";
  label?: string;
}) {
  const [state, setState] = useState<State>("hidden");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // A pre-recorded audio URL needs no TTS profile and no synthesis;
  // it should always be playable. TTS fallback only renders when the
  // creator has a cloned voice on file.
  const hasOriginal = !!audioUrl;
  const canTts = !!text;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (hasOriginal) {
        if (!cancelled) setState("idle");
        return;
      }
      if (!canTts) return;
      try {
        const r = await fetch("/api/voice/profile", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as {
          profile: unknown;
          tts_available: boolean;
        };
        if (!cancelled && d.profile && d.tts_available) {
          setState("idle");
          // Fire-and-forget warm so the first user tap on Their Voice
          // doesn't have to wait for LuxTTS to load + encode.
          fetch("/api/voice/warm", { method: "POST" }).catch(() => {});
        }
      } catch {
        /* leave hidden */
      }
    })();
    return () => {
      cancelled = true;
      audioRef.current?.pause();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, [hasOriginal, canTts]);

  if (state === "hidden") return null;

  /** Try /api/voice/speak once; on a transient failure (cold start
   *  from the LuxTTS sidecar usually presents as a slow 5xx or a
   *  network reset), wait briefly and try a second time. */
  async function synthesize(): Promise<Blob | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (r.ok) return await r.blob();
      } catch {
        /* fall through to retry */
      }
      if (attempt === 0) {
        // Best effort - if a warm round-trip happens during this
        // pause the retry will land on a hot model.
        fetch("/api/voice/warm", { method: "POST" }).catch(() => {});
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    return null;
  }

  async function play() {
    setState("loading");
    try {
      let url: string;
      if (audioUrl) {
        url = audioUrl;
      } else {
        const blob = await synthesize();
        if (!blob) {
          setState("error");
          return;
        }
        url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.addEventListener("ended", () => {
        setState("idle");
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
      });
      await audio.play();
      setState("playing");
    } catch {
      setState("error");
    }
  }

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    blobUrlRef.current = null;
    setState("idle");
  }

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (state === "playing") stop();
    else if (state !== "loading") play();
  };

  if (variant === "big") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={state === "loading"}
        aria-label={
          state === "playing"
            ? "Stop"
            : state === "loading"
              ? "Loading the creator's voice"
              : "Play in the creator's voice"
        }
        className="group flex items-center gap-3 text-left flex-shrink-0"
      >
        <span
          className={`grid place-items-center w-12 h-12 rounded-full transition-colors flex-shrink-0
            ${state === "playing" ? "bg-wax text-paper" : "bg-ink text-paper hover:bg-ink/85"}
            ${state === "loading" ? "opacity-60" : ""}
          `}
        >
          {state === "loading" ? (
            <BreathingDot />
          ) : state === "playing" ? (
            <PauseIcon />
          ) : (
            <PlayIcon />
          )}
        </span>
        <span className="flex flex-col">
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft">
            {state === "playing"
              ? "Playing"
              : state === "loading"
                ? "Listening for them…"
                : state === "error"
                  ? "Couldn't play"
                  : label ?? "Hear in their voice"}
          </span>
          {state === "idle" && label === undefined && (
            <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-ink-fade">
              read aloud, verbatim
            </span>
          )}
        </span>
      </button>
    );
  }

  // small inline variant - for capture rows + lists
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "loading"}
      aria-label={
        state === "playing"
          ? "Stop"
          : "Play in the creator's voice"
      }
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border transition-colors
        ${state === "playing"
          ? "border-wax text-wax bg-wax/5"
          : "border-rule text-ink-soft hover:border-ink-muted hover:text-ink bg-bg-raised"}
      `}
    >
      <span className="grid place-items-center w-3.5 h-3.5">
        {state === "loading" ? (
          <BreathingDot small />
        ) : state === "playing" ? (
          <PauseIcon small />
        ) : (
          <PlayIcon small />
        )}
      </span>
      <span className="font-mono text-[10px] tracking-[0.14em] uppercase">
        {state === "playing"
          ? "Stop"
          : state === "loading"
            ? "Loading"
            : state === "error"
              ? "Try again"
              : label ?? "Their voice"}
      </span>
    </button>
  );
}

function PlayIcon({ small = false }: { small?: boolean }) {
  const s = small ? 8 : 14;
  return (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="M3 1.5l7 4.5-7 4.5z" />
    </svg>
  );
}

function PauseIcon({ small = false }: { small?: boolean }) {
  const s = small ? 8 : 12;
  return (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <rect x="2.5" y="2" width="2.5" height="8" rx="0.5" />
      <rect x="7" y="2" width="2.5" height="8" rx="0.5" />
    </svg>
  );
}

function BreathingDot({ small = false }: { small?: boolean }) {
  const s = small ? 8 : 12;
  return (
    <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden>
      <circle cx="6" cy="6" r="2.5" fill="currentColor">
        <animate
          attributeName="opacity"
          values="0.3;1;0.3"
          dur="1.4s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}

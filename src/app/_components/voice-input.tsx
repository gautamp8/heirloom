"use client";

import { useEffect, useRef, useState } from "react";
import { webmBlobToWav } from "@/lib/voice-record";

type State =
  | "idle"
  | "recording"
  | "uploading"
  | "error";

/**
 * Mic icon that records audio, transcribes via /api/transcribe, and
 * appends the transcript to the bound text input. The user keeps
 * authorship - they can edit the transcript before submitting.
 *
 * Bind via `value` + `onTextAppend`. Place inside the input's wrapper.
 */
export function VoiceInput({
  value,
  onTextAppend,
  disabled = false,
}: {
  value: string;
  onTextAppend: (next: string) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<State>("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(
    () => () => {
      if (recRef.current?.state === "recording") recRef.current.stop();
    },
    [],
  );

  async function start() {
    if (disabled || state !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => stream.getTracks().forEach((t) => t.stop());
      recRef.current = mr;
      startedAtRef.current = Date.now();
      mr.start();
      setState("recording");
      const tick = () => {
        if (!recRef.current || recRef.current.state !== "recording") return;
        setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  async function stop() {
    const mr = recRef.current;
    if (!mr) return;
    setState("uploading");
    await new Promise<void>((resolve) => {
      mr.addEventListener("stop", () => resolve(), { once: true });
      mr.stop();
    });
    try {
      const webm = new Blob(chunksRef.current, { type: "audio/webm" });
      const wav = await webmBlobToWav(webm);
      const fd = new FormData();
      fd.append("audio", wav, "voice.wav");
      const r = await fetch("/api/transcribe", { method: "POST", body: fd });
      if (!r.ok) {
        setState("error");
        setTimeout(() => setState("idle"), 2500);
        return;
      }
      const data = (await r.json()) as { text: string };
      const text = data.text?.trim();
      if (text) {
        const sep = value && !value.endsWith(" ") && !value.endsWith("\n") ? " " : "";
        onTextAppend(value + sep + text);
      }
      setState("idle");
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  }

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (state === "recording") stop();
    else if (state === "idle") start();
  };

  const title =
    state === "recording"
      ? `Stop and transcribe (${seconds}s)`
      : state === "uploading"
        ? "Transcribing…"
        : state === "error"
          ? "Couldn't transcribe - try again"
          : "Dictate";

  const base =
    "flex-shrink-0 grid place-items-center w-11 h-11 rounded-full transition-all border";
  const tone =
    state === "recording"
      ? "bg-wax text-paper border-wax shadow-paper-2"
      : state === "error"
        ? "text-wax border-wax/40 bg-paper"
        : state === "uploading"
          ? "text-ink-soft border-rule bg-bg-raised"
          : "text-ink border-ink-muted/40 bg-paper hover:border-ink-muted hover:bg-bg-raised";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || state === "uploading"}
      title={title}
      aria-label={title}
      className={`${base} ${tone}`}
    >
      {state === "recording" ? (
        <RecordingIcon seconds={seconds} />
      ) : state === "uploading" ? (
        <SpinnerIcon />
      ) : (
        <MicIcon />
      )}
    </button>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="6" y="2" width="4" height="8" rx="2" />
      <path d="M3.5 7v1a4.5 4.5 0 0 0 9 0V7M8 12.5V14M5.5 14h5" />
    </svg>
  );
}

function RecordingIcon({ seconds }: { seconds: number }) {
  return (
    <span className="relative grid place-items-center w-full h-full">
      <span
        className="absolute inset-[3px] rounded-full bg-paper/25"
        style={{ animation: "pulse 1.3s ease-in-out infinite" }}
      />
      <span className="relative font-mono text-[10px] tracking-wider font-medium">{seconds}</span>
    </span>
  );
}

function SpinnerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.25" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.9s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

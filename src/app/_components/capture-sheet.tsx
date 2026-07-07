"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { VoiceInput } from "./voice-input";
import type { HomeCapture } from "../page";

type Stage = "uploaded" | "transcribed" | "embedded" | "tagged" | "ready" | "failed";

/** Stage-aware copy. Calm verbs, no productivity-app urgency. */
function pipelineLabel(
  kind: "audio" | "note" | "photo",
  stage: Stage | null,
): string {
  if (kind === "audio") {
    switch (stage) {
      case null:
      case "uploaded":
        return "Saving the recording…";
      case "transcribed":
        return "Listening for the words…";
      case "embedded":
        return "Tracing the threads…";
      case "tagged":
        return "Almost there…";
      case "ready":
        return "Saved. This is the beginning.";
      case "failed":
        return "Something went wrong. The recording is still kept.";
    }
  }
  if (kind === "photo") {
    switch (stage) {
      case null:
      case "uploaded":
        return "Holding the photograph…";
      case "transcribed":
        return "Looking at the photograph…";
      case "embedded":
        return "Tracing the threads…";
      case "tagged":
        return "Almost there…";
      case "ready":
        return "Saved. This is the beginning.";
      case "failed":
        return "Something went wrong. The photograph is still kept.";
    }
  }
  switch (stage) {
    case null:
    case "uploaded":
      return "Saving your words…";
    case "embedded":
      return "Reading what you wrote…";
    case "transcribed":
    case "tagged":
      return "Tracing the threads…";
    case "ready":
      return "Saved. This is the beginning.";
    case "failed":
      return "Something went wrong. The note is still kept.";
  }
}

/** Calm three-dot animator (matches Reflection's progress style). */
function useBreathDots(): string {
  const [n, setN] = useState(1);
  useEffect(() => {
    const id = window.setInterval(() => setN((v) => (v % 3) + 1), 500);
    return () => clearInterval(id);
  }, []);
  return ".".repeat(n);
}

/** Pulsing chip placeholders sized like real tag chips. Used while the
 *  pipeline is past the embedding stage but tags haven't landed yet. */
function TagChipSkeleton() {
  const widths = [56, 72, 64, 48, 80];
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {widths.map((w, i) => (
        <motion.span
          key={i}
          className="inline-block h-[24px] rounded-full border border-rule-soft"
          style={{ width: w, background: "var(--color-rule)", opacity: 0.4 }}
          animate={{ opacity: [0.25, 0.55, 0.25] }}
          transition={{
            duration: 1.6,
            ease: "easeInOut",
            repeat: Infinity,
            delay: i * 0.1,
          }}
        />
      ))}
    </div>
  );
}

/** Pulsing transcript-shaped placeholder for the gap before Whisper finishes. */
function TranscriptSkeleton() {
  const widths = [88, 96, 72];
  return (
    <div className="flex flex-col gap-2 w-full">
      {widths.map((w, i) => (
        <motion.div
          key={i}
          className="h-[12px] rounded-[3px]"
          style={{ width: `${w}%`, background: "var(--color-rule)" }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{
            duration: 1.6,
            ease: "easeInOut",
            repeat: Infinity,
            delay: i * 0.12,
          }}
        />
      ))}
    </div>
  );
}

export function CaptureSheet(props: {
  mode: "voice" | "note" | "photo";
  /** Optional. When set the sheet shows it as the topic the user is
   *  responding to (from the prompt-of-day card). When null the capture
   *  is free-form and the prompt block is hidden. */
  prompt: string | null;
  onClose: () => void;
  onSaved: (cap: HomeCapture) => void;
}) {
  const headers: Record<typeof props.mode, string> = {
    voice: "Speak a memory",
    note: "Write a memory",
    photo: "Hold a photograph",
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/30"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        className="w-full bg-paper rounded-t-[24px] shadow-paper-3 max-h-[92dvh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        <div className="pt-3 pb-2 px-5 flex flex-col items-center sticky top-0 bg-paper z-10">
          <div className="w-9 h-1 rounded-full bg-rule-strong mb-3" />
          <div className="w-full flex items-center justify-between">
            <p className="font-serif italic text-[20px] text-ink">
              {headers[props.mode]}
            </p>
            <button
              className="text-ink-muted hover:text-ink p-1.5 px-2.5 rounded-md"
              onClick={props.onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="px-5 pb-6 pt-2">
          {props.prompt && (
            <div className="mb-5">
              <p className="p-meta mb-1.5">Prompt</p>
              <p className="font-serif italic text-[17px] leading-[1.35] text-ink-soft">
                {props.prompt}
              </p>
            </div>
          )}
          {props.mode === "voice" && (
            <VoiceCapture prompt={props.prompt} onSaved={props.onSaved} />
          )}
          {props.mode === "note" && (
            <NoteCapture prompt={props.prompt} onSaved={props.onSaved} />
          )}
          {props.mode === "photo" && (
            <PhotoCapture prompt={props.prompt} onSaved={props.onSaved} />
          )}
        </div>
      </div>
    </div>
  );
}

function VoiceCapture({
  onSaved,
}: {
  prompt: string | null;
  onSaved: (cap: HomeCapture) => void;
}) {
  const [state, setState] = useState<
    "idle" | "recording" | "stopped" | "uploading" | "processing" | "ready"
  >("idle");
  const [bars, setBars] = useState<number[]>(new Array(48).fill(0.1));
  const [elapsedMs, setElapsedMs] = useState(0);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [tags, setTags] = useState<{ kind: string; value: string }[]>([]);
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dots = useBreathDots();

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  function teardown() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const ac = audioCtxRef.current;
    if (ac && ac.state !== "closed") {
      ac.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    recorderRef.current = null;
  }
  useEffect(() => teardown, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ac = new AudioContext();
      audioCtxRef.current = ac;
      const source = ac.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => commit();
      rec.start(250);
      // eslint-disable-next-line react-hooks/purity -- runs in a click handler, never during render
      startedAtRef.current = Date.now();
      setState("recording");
      tick();
    } catch (err) {
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone access was declined. You can switch to writing instead."
          : "Couldn't access the microphone.",
      );
    }
  }

  function tick() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    // Reduce 256 samples to 48 bars (per visible width)
    const out: number[] = [];
    const step = Math.floor(buf.length / 48);
    for (let i = 0; i < 48; i++) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const v = Math.abs(buf[i * step + j] - 128) / 128;
        if (v > max) max = v;
      }
      out.push(Math.min(1, Math.max(0.08, max * 1.4)));
    }
    setBars(out);
    // eslint-disable-next-line react-hooks/purity -- runs in a rAF loop, never during render
    setElapsedMs(Date.now() - startedAtRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }

  function stop() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setState("stopped");
  }

  async function commit() {
    setState("uploading");
    const webm = new Blob(chunksRef.current, { type: "audio/webm" });
    const durationMs =
      startedAtRef.current > 0 ? Date.now() - startedAtRef.current : elapsedMs;

    // Decode + re-encode to PCM WAV client-side. whisper-cpp accepts WAV
    // directly; doing this in the browser means the server-side pipeline
    // never has to shell out to ffmpeg, which doesn't ship in the Mac
    // bundle.
    const { webmBlobToWav } = await import("@/lib/voice-record");
    const blob = await webmBlobToWav(webm);

    // Survive a dropped network or closed tab - drafts live in IndexedDB
    // and resume from the home banner.
    let draftId: number | undefined;
    try {
      const { saveDraft } = await import("@/lib/drafts");
      draftId = await saveDraft({
        kind: "audio",
        blob,
        body: null,
        title: null,
        prompt: null,
        duration_ms: durationMs,
        faces: null,
      });
    } catch (e) {
      console.warn("[drafts] save failed", e);
    }

    const fd = new FormData();
    fd.set("file", new File([blob], "capture.wav", { type: "audio/wav" }));
    fd.set(
      "metadata",
      JSON.stringify({ kind: "audio", duration_ms: durationMs }),
    );
    const r = await fetch("/api/capture", { method: "POST", body: fd });
    if (!r.ok) {
      setError("Upload failed. The recording is safe in your browser.");
      setState("idle");
      return;
    }
    const { capture_id } = (await r.json()) as { capture_id: string };
    setState("processing");

    const es = new EventSource(`/api/capture/${capture_id}/status`);
    es.addEventListener("stage", (ev) => {
      const { stage: s } = JSON.parse((ev as MessageEvent).data) as { stage: Stage };
      setStage(s);
      if (s === "ready") setState("ready");
    });
    es.addEventListener("transcript", (ev) => {
      const { text } = JSON.parse((ev as MessageEvent).data) as { text: string };
      setTranscript(text);
    });
    es.addEventListener("tags", (ev) => {
      const { tags: t } = JSON.parse((ev as MessageEvent).data) as {
        tags: { kind: string; value: string }[];
      };
      setTags(t);
    });
    es.addEventListener("ready", async (ev) => {
      const { capture } = JSON.parse((ev as MessageEvent).data) as {
        capture: HomeCapture & { transcript_snippet?: string };
      };
      // Pipeline succeeded - clear the local draft.
      if (draftId !== undefined) {
        try {
          const { clearDraft } = await import("@/lib/drafts");
          await clearDraft(draftId);
        } catch (e) {
          console.warn("[drafts] clear failed", e);
        }
      }
      onSaved({ ...capture, transcript_snippet: capture.transcript_snippet ?? null });
      es.close();
    });
    es.addEventListener("error", () => {
      es.close();
    });
  }

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Waveform - 48 bars */}
      <div className="w-full h-32 flex items-center justify-center gap-[3px] px-2">
        {bars.map((h, i) => (
          <span
            key={i}
            className="w-[3px] rounded-[1.5px] transition-[height] duration-[80ms] ease-out"
            style={{
              height: `${Math.max(6, h * 100)}%`,
              background:
                state === "recording"
                  ? "var(--color-wax)"
                  : state === "ready" || state === "processing" || state === "uploading"
                    ? "var(--color-ink-soft)"
                    : "var(--color-ink-muted)",
              opacity:
                state === "idle" || state === "stopped" ? 0.45 : 1,
            }}
          />
        ))}
      </div>

      <div className="font-mono text-[13px] text-ink-muted tracking-[0.1em]">
        {state === "idle" || state === "ready"
          ? "00:00"
          : formatElapsed(elapsedMs)}
      </div>

      {state === "idle" && (
        <button
          className="w-[72px] h-[72px] rounded-full grid place-items-center text-white border-none cursor-pointer transition"
          style={{
            background: "var(--color-wax)",
            boxShadow: "var(--shadow-wax)",
          }}
          onClick={start}
        >
          <span className="w-[18px] h-[18px] rounded-full bg-white" />
        </button>
      )}

      {state === "recording" && (
        <button
          className="w-[72px] h-[72px] rounded-full grid place-items-center text-white border-none cursor-pointer transition"
          style={{
            background: "var(--color-ink)",
            boxShadow: "var(--shadow-wax)",
          }}
          onClick={stop}
        >
          <span className="w-[18px] h-[18px] rounded-[3px] bg-white" />
        </button>
      )}

      {(state === "uploading" || state === "processing" || state === "ready") && (
        <div className="flex flex-col items-center gap-4 w-full">
          <p className="p-meta">
            {state === "ready"
              ? pipelineLabel("audio", "ready")
              : pipelineLabel("audio", stage) + dots.slice(0, dots.length - 1)}
          </p>

          {/* Transcript: skeleton until Whisper completes, then real text */}
          {transcript ? (
            <p className="font-serif italic text-[15px] leading-[1.6] text-ink-soft text-wrap-pretty">
              {transcript}
            </p>
          ) : (
            state !== "ready" && <TranscriptSkeleton />
          )}

          {/* Tags: skeleton chips once the pipeline has chunked the transcript */}
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-2 justify-center">
              {tags.map((t) => (
                <span
                  key={`${t.kind}:${t.value}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-rule font-sans text-[11px] text-ink-soft bg-bg-raised"
                >
                  <span className="text-wax">·</span>
                  {t.value}
                </span>
              ))}
            </div>
          ) : (
            (stage === "embedded" || stage === "tagged") && <TagChipSkeleton />
          )}
        </div>
      )}

      {error && <p className="p-body text-wax">{error}</p>}
    </div>
  );
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

function NoteCapture({
  prompt,
  onSaved,
}: {
  prompt: string | null;
  onSaved: (cap: HomeCapture) => void;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [state, setState] = useState<
    "typing" | "saving" | "processing" | "ready"
  >("typing");
  const [tags, setTags] = useState<{ kind: string; value: string }[]>([]);
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A prompt response uses the prompt as its title; only free-form
  // notes accept an explicit title.
  const titleEditable = !prompt;
  const dots = useBreathDots();

  async function commit() {
    if (!text.trim()) return;
    setState("saving");
    setError(null);

    // Same draft-resume pattern as audio: survive a dropped network.
    let draftId: number | undefined;
    try {
      const { saveDraft } = await import("@/lib/drafts");
      draftId = await saveDraft({
        kind: "note",
        blob: null,
        body: text.trim(),
        title: titleEditable ? title.trim() || null : null,
        prompt: prompt ?? null,
        duration_ms: null,
        faces: null,
      });
    } catch (e) {
      console.warn("[drafts] save failed", e);
    }

    const r = await fetch("/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "note",
        body: text.trim(),
        title: titleEditable ? title.trim() || null : null,
      }),
    });
    if (!r.ok) {
      setError("Save failed. The note is safe in your browser.");
      setState("typing");
      return;
    }
    const { capture_id } = (await r.json()) as { capture_id: string };
    setState("processing");

    const es = new EventSource(`/api/capture/${capture_id}/status`);
    es.addEventListener("stage", (ev) => {
      const { stage: s } = JSON.parse((ev as MessageEvent).data) as { stage: Stage };
      setStage(s);
    });
    es.addEventListener("tags", (ev) => {
      const { tags: t } = JSON.parse((ev as MessageEvent).data) as {
        tags: { kind: string; value: string }[];
      };
      setTags(t);
    });
    es.addEventListener("ready", async (ev) => {
      const { capture } = JSON.parse((ev as MessageEvent).data) as {
        capture: HomeCapture & { transcript_snippet?: string };
      };
      if (draftId !== undefined) {
        try {
          const { clearDraft } = await import("@/lib/drafts");
          await clearDraft(draftId);
        } catch (e) {
          console.warn("[drafts] clear failed", e);
        }
      }
      setState("ready");
      onSaved({ ...capture, transcript_snippet: capture.transcript_snippet ?? null });
      es.close();
    });
    es.addEventListener("error", () => {
      setState("typing");
      es.close();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {titleEditable && (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="A title, if one wants to come"
          maxLength={200}
          disabled={state !== "typing"}
          className="w-full font-serif text-[22px] font-light text-ink bg-transparent border-none outline-none placeholder:text-ink-muted placeholder:italic"
          aria-label="Title"
        />
      )}
      <textarea
        className="w-full font-serif text-[17px] leading-[1.55] text-ink bg-transparent border-none outline-none resize-none min-h-[240px] placeholder:text-ink-muted placeholder:italic"
        placeholder="Take your time. Begin when you're ready. Or tap the mic and speak it."
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus={!titleEditable}
        disabled={state !== "typing"}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-fade">
            {text.length === 0
              ? "0 words"
              : `${text.trim().split(/\s+/).length} words`}
          </span>
          <VoiceInput value={text} onTextAppend={setText} disabled={state !== "typing"} />
        </div>
        <button
          className="btn"
          onClick={commit}
          disabled={state !== "typing" || !text.trim()}
        >
          {state === "typing" ? "Save to vault" : state === "ready" ? "Saved" : "Saving…"}
        </button>
      </div>

      {(state === "saving" || state === "processing" || state === "ready") && (
        <div className="flex flex-col gap-3 mt-2">
          <p className="p-meta">
            {state === "ready"
              ? pipelineLabel("note", "ready")
              : pipelineLabel("note", stage) + dots.slice(0, dots.length - 1)}
          </p>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <span
                  key={`${t.kind}:${t.value}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-rule font-sans text-[11px] text-ink-soft bg-bg-raised"
                >
                  <span className="text-wax">·</span>
                  {t.value}
                </span>
              ))}
            </div>
          ) : (
            state !== "ready" && <TagChipSkeleton />
          )}
        </div>
      )}

      {error && <p className="p-body text-wax">{error}</p>}
    </div>
  );
}

function PhotoCapture({
  prompt,
  onSaved,
}: {
  prompt: string | null;
  onSaved: (cap: HomeCapture) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [titleEditable] = useState(!prompt);
  const [title, setTitle] = useState("");
  const [state, setState] = useState<
    "picking" | "previewing" | "saving" | "processing" | "ready"
  >("picking");
  const [stage, setStage] = useState<Stage | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [tags, setTags] = useState<{ kind: string; value: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [faceState, setFaceState] = useState<"idle" | "scanning" | "done">("idle");
  const [faces, setFaces] = useState<
    { bbox: { x: number; y: number; w: number; h: number }; embedding: number[] }[]
  >([]);
  const dots = useBreathDots();

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setState("previewing");
    setError(null);
    setFaces([]);
    setFaceState("scanning");
    try {
      const { extractFaces } = await import("@/lib/face-client");
      const detected = await extractFaces(f);
      setFaces(detected);
    } catch (err) {
      console.warn("[faces] detection failed", err);
    } finally {
      setFaceState("done");
    }
  }

  async function commit() {
    if (!file) return;
    setState("saving");
    setError(null);

    let draftId: number | undefined;
    try {
      const { saveDraft } = await import("@/lib/drafts");
      draftId = await saveDraft({
        kind: "photo",
        blob: file,
        body: null,
        title: titleEditable ? title.trim() || null : null,
        prompt: prompt ?? null,
        duration_ms: null,
        faces,
      });
    } catch (e) {
      console.warn("[drafts] save failed", e);
    }

    const fd = new FormData();
    fd.set("file", file);
    fd.set(
      "metadata",
      JSON.stringify({
        kind: "photo",
        captured_at: new Date(file.lastModified || Date.now()).toISOString(),
        title: titleEditable ? title.trim() || null : null,
        faces,
      }),
    );
    const r = await fetch("/api/capture", { method: "POST", body: fd });
    if (!r.ok) {
      setError("Save failed. The photo is safe in your browser.");
      setState("previewing");
      return;
    }
    const { capture_id } = (await r.json()) as { capture_id: string };
    setState("processing");

    const es = new EventSource(`/api/capture/${capture_id}/status`);
    es.addEventListener("stage", (ev) => {
      const { stage: s } = JSON.parse((ev as MessageEvent).data) as { stage: Stage };
      setStage(s);
    });
    es.addEventListener("transcript", (ev) => {
      // The pipeline re-uses 'transcript' to surface the photo caption.
      const { text } = JSON.parse((ev as MessageEvent).data) as { text: string };
      setCaption(text);
    });
    es.addEventListener("tags", (ev) => {
      const { tags: t } = JSON.parse((ev as MessageEvent).data) as {
        tags: { kind: string; value: string }[];
      };
      setTags(t);
    });
    es.addEventListener("ready", async (ev) => {
      const { capture } = JSON.parse((ev as MessageEvent).data) as {
        capture: HomeCapture & { transcript_snippet?: string };
      };
      if (draftId !== undefined) {
        try {
          const { clearDraft } = await import("@/lib/drafts");
          await clearDraft(draftId);
        } catch (e) {
          console.warn("[drafts] clear failed", e);
        }
      }
      setState("ready");
      onSaved({ ...capture, transcript_snippet: capture.transcript_snippet ?? null });
      es.close();
    });
    es.addEventListener("error", () => {
      es.close();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {state === "picking" && (
        <label
          className="block w-full border border-dashed border-rule-strong rounded-[14px] p-10 text-center cursor-pointer hover:border-ink-muted transition-colors bg-bg-raised"
          aria-label="Choose a photograph"
        >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPick}
          />
          <span className="block font-serif italic text-[18px] text-ink mb-1">
            Choose a photograph
          </span>
          <span className="block font-mono text-[10px] tracking-[0.18em] uppercase text-ink-fade">
            Camera or photo library
          </span>
        </label>
      )}

      {preview && state !== "picking" && (
        <div className="relative w-full rounded-[14px] overflow-hidden border border-rule bg-paper-2 max-h-[58vh] flex items-center justify-center">
          <div className="relative inline-block max-w-full max-h-[58vh]">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview; next/image can't optimize blob: sources */}
            <img
              src={preview}
              alt="Selected photograph"
              className="max-w-full max-h-[58vh] object-contain block"
            />
            {faces.map((f, i) => (
              <span
                key={i}
                aria-hidden
                className="absolute border rounded-[3px] pointer-events-none"
                style={{
                  left: `${f.bbox.x * 100}%`,
                  top: `${f.bbox.y * 100}%`,
                  width: `${f.bbox.w * 100}%`,
                  height: `${f.bbox.h * 100}%`,
                  borderColor: "rgba(125,42,26,0.85)",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.4) inset",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {state === "previewing" && faceState !== "idle" && (
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
          {faceState === "scanning"
            ? `Looking for faces${dots}`
            : faces.length === 0
              ? "No faces detected"
              : faces.length === 1
                ? "1 face detected"
                : `${faces.length} faces detected`}
        </p>
      )}

      {state === "previewing" && titleEditable && (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="A title, if one wants to come"
          maxLength={200}
          className="w-full font-serif text-[22px] font-light text-ink bg-transparent border-none outline-none placeholder:text-ink-muted placeholder:italic"
          aria-label="Title"
        />
      )}

      {state === "previewing" && (
        <div className="flex items-center justify-between">
          <button
            className="btn-ghost"
            onClick={() => {
              if (preview) URL.revokeObjectURL(preview);
              setFile(null);
              setPreview(null);
              setState("picking");
            }}
          >
            Choose another
          </button>
          <button className="btn" onClick={commit}>
            Save to vault
          </button>
        </div>
      )}

      {(state === "saving" || state === "processing" || state === "ready") && (
        <div className="flex flex-col gap-3 mt-2">
          <p className="p-meta">
            {state === "ready"
              ? pipelineLabel("photo", "ready")
              : pipelineLabel("photo", stage) + dots.slice(0, dots.length - 1)}
          </p>
          {caption && (
            <p className="font-serif italic text-[15px] leading-[1.5] text-ink-soft">
              {caption}
            </p>
          )}
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <span
                  key={`${t.kind}:${t.value}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-rule font-sans text-[11px] text-ink-soft bg-bg-raised"
                >
                  <span className="text-wax">·</span>
                  {t.value}
                </span>
              ))}
            </div>
          ) : (
            state !== "ready" && !caption && <TagChipSkeleton />
          )}
        </div>
      )}

      {error && <p className="p-body text-wax">{error}</p>}
    </div>
  );
}

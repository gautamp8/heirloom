"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { VOICE_SCRIPT, webmBlobToWav } from "@/lib/voice-record";

type Step = "welcome" | "voice" | "anchors" | "nominees" | "letters";
const STEPS: Step[] = ["welcome", "voice", "anchors", "nominees", "letters"];

type LifeEvent = {
  kind: string;
  label: string;
  event_date: string;
  recurrence: "yearly" | "once" | "";
};

type Nominee = {
  name: string;
  relation: string;
  birthday: string;
  face_embedding?: number[] | null;
  photo_preview?: string | null;
  photo_state?: "idle" | "scanning" | "ready" | "error";
};

type Draft = {
  to: string;
  prompt: string;
  trigger: string;
  body: string;
};

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [selfieEmbedding, setSelfieEmbedding] = useState<number[] | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [selfieScanning, setSelfieScanning] = useState(false);

  const [events, setEvents] = useState<LifeEvent[]>([
    { kind: "birth", label: "My birthday", event_date: "", recurrence: "yearly" },
  ]);

  const [nominees, setNominees] = useState<Nominee[]>([
    { name: "", relation: "", birthday: "" },
  ]);

  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passphrases, setPassphrases] = useState<
    { name: string; passphrase: string }[]
  >([]);

  const stepIndex = STEPS.indexOf(step);

  useEffect(() => {
    return () => {
      if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    };
  }, [selfiePreview]);

  async function onSelfie(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    setSelfiePreview(URL.createObjectURL(f));
    setSelfieScanning(true);
    setError(null);
    try {
      const { extractFaces } = await import("@/lib/face-client");
      const faces = await extractFaces(f);
      if (faces.length === 0) {
        setError("No face detected. Try a clearer photo or skip this step.");
        setSelfieEmbedding(null);
      } else {
        // Use the largest face as the self portrait
        const largest = [...faces].sort(
          (a, b) => b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h,
        )[0];
        setSelfieEmbedding(largest.embedding);
      }
    } catch (err) {
      console.warn("[onboarding] selfie scan failed", err);
      setError("Couldn't scan that photo. You can skip and add one later.");
    } finally {
      setSelfieScanning(false);
    }
  }

  async function submitWelcome() {
    if (!name.trim()) {
      setError("Please add your name to continue.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/onboarding/self", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: name.trim(),
          face_embedding: selfieEmbedding,
        }),
      });
      if (!r.ok) throw new Error("save failed");
      setStep("voice");
    } catch {
      setError("Save failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAnchors() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = events
        .filter((e) => e.label.trim())
        .map((e) => ({
          kind: e.kind,
          label: e.label.trim(),
          event_date: e.event_date || null,
          recurrence: e.recurrence || null,
        }));
      await fetch("/api/onboarding/life-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: payload }),
      });
      setStep("nominees");
    } catch {
      setError("Save failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitNominees() {
    const valid = nominees.filter((n) => n.name.trim());
    if (valid.length === 0) {
      setError("Add at least one person this archive is for.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/onboarding/nominees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nominees: valid.map((n) => ({
            name: n.name.trim(),
            relation: n.relation.trim() || null,
            birthday: n.birthday || null,
            face_embedding:
              Array.isArray(n.face_embedding) && n.face_embedding.length === 128
                ? n.face_embedding
                : null,
          })),
        }),
      });
      const d = (await r.json()) as {
        nominees?: { name: string; passphrase: string }[];
      };
      if (Array.isArray(d.nominees)) {
        setPassphrases(d.nominees.map((n) => ({ name: n.name, passphrase: n.passphrase })));
      }
      setStep("letters");
      // Eagerly fetch Gemma-generated prompts when we land on letters
      loadDrafts();
    } catch {
      setError("Save failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadDrafts() {
    setDraftsLoading(true);
    try {
      const r = await fetch("/api/onboarding/seed-prompts", { method: "POST" });
      const d = (await r.json()) as {
        drafts: { to: string; prompt: string; trigger: string }[];
      };
      setDrafts((d.drafts ?? []).map((x) => ({ ...x, body: "" })));
    } catch {
      setDrafts([]);
    } finally {
      setDraftsLoading(false);
    }
  }

  async function submitLetters() {
    const filled = (drafts ?? []).filter((d) => d.body.trim());
    setSubmitting(true);
    setError(null);
    try {
      if (filled.length > 0) {
        await fetch("/api/onboarding/seed-letters", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            drafts: filled.map((d) => ({
              to_nominee_name: d.to,
              occasion_prompt: d.prompt,
              body: d.body,
              trigger_hint: d.trigger,
            })),
          }),
        });
      }
      await fetch("/api/onboarding/complete", { method: "POST" });
      router.push("/");
    } catch {
      setError("Save failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Progress dots */}
      <div className="flex items-center gap-2 mb-10">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className="h-[3px] rounded-full transition-all"
            style={{
              width: i === stepIndex ? 28 : 14,
              background:
                i <= stepIndex ? "var(--color-ink)" : "var(--color-rule-strong)",
            }}
          />
        ))}
        <span className="ml-3 font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted">
          Step {stepIndex + 1} of {STEPS.length}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          {step === "welcome" && (
            <WelcomeStep
              name={name}
              setName={setName}
              onSelfie={onSelfie}
              selfiePreview={selfiePreview}
              selfieScanning={selfieScanning}
              selfieReady={!!selfieEmbedding}
              clearSelfie={() => {
                if (selfiePreview) URL.revokeObjectURL(selfiePreview);
                setSelfiePreview(null);
                setSelfieEmbedding(null);
              }}
              onContinue={submitWelcome}
              submitting={submitting}
            />
          )}
          {step === "voice" && (
            <VoiceStep
              onBack={() => setStep("welcome")}
              onContinue={() => setStep("anchors")}
            />
          )}
          {step === "anchors" && (
            <AnchorsStep
              events={events}
              setEvents={setEvents}
              onBack={() => setStep("voice")}
              onContinue={submitAnchors}
              submitting={submitting}
            />
          )}
          {step === "nominees" && (
            <NomineesStep
              nominees={nominees}
              setNominees={setNominees}
              onBack={() => setStep("anchors")}
              onContinue={submitNominees}
              submitting={submitting}
            />
          )}
          {step === "letters" && (
            <LettersStep
              drafts={drafts}
              setDrafts={setDrafts}
              loading={draftsLoading}
              passphrases={passphrases}
              onReload={loadDrafts}
              onBack={() => setStep("nominees")}
              onComplete={submitLetters}
              submitting={submitting}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {error && (
        <p className="mt-6 font-serif italic text-[15px] text-wax">{error}</p>
      )}
    </>
  );
}

/* ============================================================
   Step 1 - Welcome + name + selfie
   ============================================================ */

function WelcomeStep(props: {
  name: string;
  setName: (s: string) => void;
  onSelfie: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selfiePreview: string | null;
  selfieScanning: boolean;
  selfieReady: boolean;
  clearSelfie: () => void;
  onContinue: () => void;
  submitting: boolean;
}) {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="eyebrow mb-2">Welcome</p>
        <h1 className="h-title mb-3">
          Let&rsquo;s begin <em>with you.</em>
        </h1>
        <p className="p-body max-w-[480px]">
          A few questions so the archive knows whose memories it&rsquo;s holding,
          and who it&rsquo;s for. You can change any of this later.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="eyebrow">Your name</label>
        <input
          type="text"
          value={props.name}
          onChange={(e) => props.setName(e.target.value)}
          placeholder="Elena"
          maxLength={60}
          className="w-full max-w-[420px] font-serif text-[24px] font-light text-ink bg-transparent border-b border-rule-strong outline-none focus:border-ink py-2 placeholder:text-ink-muted placeholder:italic"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <p className="eyebrow mb-1">A photo of you, if you&rsquo;d like</p>
          <p className="font-serif italic text-[14px] text-ink-muted max-w-[480px]">
            Used only on this device, to recognise you in future photos. Your
            face never leaves your phone.
          </p>
        </div>

        {!props.selfiePreview && (
          <label
            className="block w-full max-w-[260px] border border-dashed border-rule-strong rounded-[14px] p-6 text-center cursor-pointer hover:border-ink-muted transition-colors bg-bg-raised"
            aria-label="Take a selfie"
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={props.onSelfie}
            />
            <span className="block font-serif italic text-[16px] text-ink mb-0.5">
              Add a photo
            </span>
            <span className="block font-mono text-[10px] tracking-[0.18em] uppercase text-ink-fade">
              Or skip for now
            </span>
          </label>
        )}

        {props.selfiePreview && (
          <div className="flex items-center gap-4">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={props.selfiePreview}
                alt="You"
                className="w-24 h-24 rounded-full object-cover border border-rule"
              />
              {props.selfieScanning && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full border-2 border-ink/15 border-t-ink animate-spin"
                />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-ink-muted">
                {props.selfieScanning
                  ? "Looking for your face…"
                  : props.selfieReady
                    ? "Face recognised"
                    : "No face detected"}
              </p>
              <button
                className="btn-ghost text-left"
                onClick={props.clearSelfie}
                type="button"
              >
                Try a different photo
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 mt-2">
        <button
          className="btn"
          onClick={props.onContinue}
          disabled={props.submitting || props.selfieScanning || !props.name.trim()}
        >
          {props.submitting
            ? "Saving…"
            : props.selfieScanning
              ? "Scanning…"
              : "Continue"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Step 2 - Life anchors (dates that matter)
   ============================================================ */

const EVENT_KINDS = [
  { value: "birth", label: "Birthday" },
  { value: "anniversary", label: "Anniversary" },
  { value: "wedding", label: "Wedding" },
  { value: "graduation", label: "Graduation" },
  { value: "loss", label: "Loss" },
  { value: "milestone", label: "Milestone" },
];

function VoiceStep(props: { onBack: () => void; onContinue: () => void }) {
  type S =
    | { kind: "ready" }
    | { kind: "recording"; durationMs: number }
    | { kind: "processing" }
    | { kind: "preview"; url: string; blob: Blob }
    | { kind: "uploading" }
    | { kind: "done" }
    | { kind: "error"; message: string };
  const [state, setState] = useState<S>({ kind: "ready" });
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  async function start() {
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
      setState({ kind: "recording", durationMs: 0 });
      const tick = () => {
        if (!recRef.current || recRef.current.state !== "recording") return;
        setState({
          kind: "recording",
          durationMs: Date.now() - startedAtRef.current,
        });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setState({ kind: "error", message: "Microphone access was denied." });
    }
  }

  async function stop() {
    const mr = recRef.current;
    if (!mr) return;
    await new Promise<void>((resolve) => {
      mr.addEventListener("stop", () => resolve(), { once: true });
      mr.stop();
    });
    setState({ kind: "processing" });
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    const wav = await webmBlobToWav(blob);
    setState({ kind: "preview", url: URL.createObjectURL(wav), blob: wav });
  }

  async function save() {
    if (state.kind !== "preview") return;
    setState({ kind: "uploading" });
    const fd = new FormData();
    fd.append("audio", state.blob, "reference.wav");
    fd.append("reference_text", VOICE_SCRIPT);
    const r = await fetch("/api/voice/clone", { method: "POST", body: fd });
    if (!r.ok) {
      const err = (await r.json().catch(() => null)) as
        | { error?: { code?: string } }
        | null;
      const msg =
        err?.error?.code === "recording_too_short"
          ? "That recording is a bit short. Try reading the full passage so the voice can be cloned cleanly."
          : "Couldn't save your voice. The engine may be starting up.";
      setState({ kind: "error", message: msg });
      return;
    }
    setState({ kind: "done" });
    props.onContinue();
  }

  return (
    <>
      <p className="eyebrow mb-2">Step two</p>
      <h1 className="h-title mb-2">A little of your voice.</h1>
      <p className="p-body max-w-[520px] mb-1">
        Read this passage once, in your usual voice. The archive can then read
        anything you write back to your people in your own voice - verbatim,
        only the words you actually said or wrote.
      </p>
      <p className="p-meta max-w-[520px] mb-4">
        Optional. You can do this later from Settings.
      </p>

      <blockquote className="font-serif italic text-[17px] leading-[1.5] text-ink-soft border-l-2 border-rule pl-4 mb-5 text-wrap-pretty max-w-[560px]">
        “{VOICE_SCRIPT}”
      </blockquote>

      <div className="flex items-center gap-4 mb-4">
        {state.kind === "ready" && (
          <button type="button" className="btn" onClick={start}>
            Start recording
          </button>
        )}
        {state.kind === "recording" && (
          <button
            type="button"
            className="btn flex items-center gap-3"
            onClick={stop}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full bg-wax"
              style={{ animation: "pulse 1.4s ease-in-out infinite" }}
            />
            Stop ({Math.floor(state.durationMs / 1000)}s)
          </button>
        )}
        {state.kind === "processing" && (
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-block w-3.5 h-3.5 rounded-full border-2 border-ink/15 border-t-ink animate-spin"
            />
            <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-ink-muted">
              Listening to what you said…
            </p>
          </div>
        )}
        {state.kind === "preview" && (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={state.url} controls className="h-9" />
            <button type="button" className="btn" onClick={save}>
              Save my voice
            </button>
            <button
              type="button"
              className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted hover:text-ink underline"
              onClick={() => {
                URL.revokeObjectURL(state.url);
                setState({ kind: "ready" });
              }}
            >
              Try again
            </button>
          </>
        )}
        {state.kind === "uploading" && (
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-block w-3.5 h-3.5 rounded-full border-2 border-ink/15 border-t-ink animate-spin"
            />
            <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-ink-muted">
              Cloning your voice…
            </p>
          </div>
        )}
        {state.kind === "error" && (
          <>
            <button type="button" className="btn" onClick={() => setState({ kind: "ready" })}>
              Try again
            </button>
            <p className="p-meta">{state.message}</p>
          </>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          className="font-mono text-[12px] tracking-[0.14em] uppercase text-ink-muted hover:text-ink py-2"
          onClick={props.onBack}
        >
          ← Back
        </button>
        <button
          type="button"
          className="font-mono text-[12px] tracking-[0.14em] uppercase text-ink-muted hover:text-ink underline py-2"
          onClick={props.onContinue}
        >
          Skip for now
        </button>
      </div>
    </>
  );
}

function AnchorsStep(props: {
  events: LifeEvent[];
  setEvents: (e: LifeEvent[]) => void;
  onBack: () => void;
  onContinue: () => void;
  submitting: boolean;
}) {
  function update(i: number, patch: Partial<LifeEvent>) {
    const next = [...props.events];
    next[i] = { ...next[i], ...patch };
    props.setEvents(next);
  }
  function add() {
    props.setEvents([
      ...props.events,
      { kind: "milestone", label: "", event_date: "", recurrence: "yearly" },
    ]);
  }
  function remove(i: number) {
    props.setEvents(props.events.filter((_, k) => k !== i));
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="eyebrow mb-2">Step two</p>
        <h1 className="h-title mb-3">
          Dates <em>that matter.</em>
        </h1>
        <p className="p-body max-w-[480px]">
          Your birthday, anniversaries, the days that anchor your story. Add as
          many or as few as feel right.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {props.events.map((e, i) => (
          <div
            key={i}
            className="grid grid-cols-1 sm:grid-cols-[1fr_180px_120px_auto] gap-2 items-end rounded-[12px] border border-rule bg-bg-raised p-3"
          >
            <div className="flex flex-col gap-1">
              <label className="eyebrow text-[9px]">Label</label>
              <input
                type="text"
                value={e.label}
                onChange={(ev) => update(i, { label: ev.target.value })}
                placeholder="My birthday"
                maxLength={80}
                className="font-serif text-[16px] text-ink bg-transparent outline-none border-b border-rule placeholder:text-ink-muted placeholder:italic"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="eyebrow text-[9px]">Kind</label>
              <select
                value={e.kind}
                onChange={(ev) => update(i, { kind: ev.target.value })}
                className="font-sans text-[14px] text-ink bg-transparent outline-none border-b border-rule py-1"
              >
                {EVENT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="eyebrow text-[9px]">Date</label>
              <input
                type="date"
                value={e.event_date}
                onChange={(ev) => update(i, { event_date: ev.target.value })}
                className="font-mono text-[12px] text-ink bg-transparent outline-none border-b border-rule py-1"
              />
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-ink-muted hover:text-wax text-[18px] self-center pb-1"
              aria-label="Remove this entry"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="self-start btn-ghost mt-1"
        >
          + Add another
        </button>
      </div>

      <div className="flex items-center justify-between mt-2">
        <button className="btn-ghost" onClick={props.onBack} type="button">
          Back
        </button>
        <button
          className="btn"
          onClick={props.onContinue}
          disabled={props.submitting}
        >
          {props.submitting ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Step 3 - Nominees
   ============================================================ */

function NomineesStep(props: {
  nominees: Nominee[];
  setNominees: (n: Nominee[]) => void;
  onBack: () => void;
  onContinue: () => void;
  submitting: boolean;
}) {
  function update(i: number, patch: Partial<Nominee>) {
    const next = [...props.nominees];
    next[i] = { ...next[i], ...patch };
    props.setNominees(next);
  }
  function add() {
    props.setNominees([
      ...props.nominees,
      { name: "", relation: "", birthday: "" },
    ]);
  }
  function remove(i: number) {
    props.setNominees(props.nominees.filter((_, k) => k !== i));
  }

  async function onPhoto(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const preview = URL.createObjectURL(f);
    update(i, {
      photo_preview: preview,
      photo_state: "scanning",
      face_embedding: null,
    });
    try {
      const { extractFaces } = await import("@/lib/face-client");
      const faces = await extractFaces(f);
      if (faces.length === 0) {
        update(i, { photo_state: "error" });
        return;
      }
      const largest = [...faces].sort(
        (a, b) => b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h,
      )[0];
      update(i, {
        photo_state: "ready",
        face_embedding: largest.embedding,
      });
    } catch (err) {
      console.warn("[onboarding] nominee face scan failed", err);
      update(i, { photo_state: "error" });
    } finally {
      if (e.target) e.target.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="eyebrow mb-2">Step three</p>
        <h1 className="h-title mb-3">
          Who is this <em>for?</em>
        </h1>
        <p className="p-body max-w-[480px]">
          The people you want this archive to reach. A name is enough - anything
          else helps the archive know them as they grow.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {props.nominees.map((n, i) => (
          <div
            key={i}
            className="grid grid-cols-1 sm:grid-cols-[1fr_160px_140px_auto] gap-2 items-end rounded-[12px] border border-rule bg-bg-raised p-3"
          >
            <div className="flex flex-col gap-1">
              <label className="eyebrow text-[9px]">Name</label>
              <input
                type="text"
                value={n.name}
                onChange={(ev) => update(i, { name: ev.target.value })}
                placeholder="Maya"
                maxLength={60}
                className="font-serif text-[16px] text-ink bg-transparent outline-none border-b border-rule placeholder:text-ink-muted placeholder:italic"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="eyebrow text-[9px]">Relation</label>
              <input
                type="text"
                value={n.relation}
                onChange={(ev) => update(i, { relation: ev.target.value })}
                placeholder="daughter"
                maxLength={40}
                className="font-sans text-[14px] text-ink bg-transparent outline-none border-b border-rule placeholder:text-ink-muted"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="eyebrow text-[9px]">Birthday</label>
              <input
                type="date"
                value={n.birthday}
                onChange={(ev) => update(i, { birthday: ev.target.value })}
                className="font-mono text-[12px] text-ink bg-transparent outline-none border-b border-rule py-1"
              />
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-ink-muted hover:text-wax text-[18px] self-center pb-1"
              aria-label="Remove this entry"
            >
              ×
            </button>
            <div className="sm:col-span-4 flex items-center gap-3 mt-1">
              {n.photo_preview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={n.photo_preview}
                    alt={`${n.name || "nominee"} preview`}
                    className="w-10 h-10 rounded-full object-cover border border-rule"
                  />
                  {n.photo_state === "scanning" && (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full border-2 border-ink/15 border-t-ink animate-spin"
                    />
                  )}
                </div>
              ) : null}
              <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-fade flex-1">
                {n.photo_state === "scanning"
                  ? "Looking for their face…"
                  : n.photo_state === "ready"
                    ? "Face captured"
                    : n.photo_state === "error"
                      ? "No face detected. Try another photo."
                      : "A photo of them, if you like - helps the archive recognise them."}
              </p>
              <label className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted hover:text-ink underline cursor-pointer whitespace-nowrap">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onPhoto(i, e)}
                />
                {n.photo_state === "ready" ? "Change" : "Add photo"}
              </label>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="self-start btn-ghost mt-1"
        >
          + Add another
        </button>
      </div>

      <div className="flex items-center justify-between mt-2">
        <button className="btn-ghost" onClick={props.onBack} type="button">
          Back
        </button>
        <button
          className="btn"
          onClick={props.onContinue}
          disabled={props.submitting}
        >
          {props.submitting ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Step 4 - Seed letters (Gemma-generated occasion prompts)
   ============================================================ */

function LettersStep(props: {
  drafts: Draft[] | null;
  setDrafts: (d: Draft[]) => void;
  loading: boolean;
  passphrases: { name: string; passphrase: string }[];
  onReload: () => void;
  onBack: () => void;
  onComplete: () => void;
  submitting: boolean;
}) {
  function update(i: number, body: string) {
    if (!props.drafts) return;
    const next = [...props.drafts];
    next[i] = { ...next[i], body };
    props.setDrafts(next);
  }

  const filledCount = (props.drafts ?? []).filter((d) => d.body.trim()).length;

  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="eyebrow mb-2">Last step</p>
        <h1 className="h-title mb-3">
          Letters <em>for the right moments.</em>
        </h1>
        <p className="p-body max-w-[520px]">
          These letters stay sealed until the moment they&rsquo;re meant for -
          when your nominee is going through something, or a date arrives.
          Write any that feel right; skip the rest. You can add more anytime.
        </p>
      </div>

      {props.passphrases.length > 0 && (
        <article className="rounded-[14px] border-2 p-5 relative overflow-hidden"
          style={{
            borderColor: "var(--color-wax)",
            background:
              "linear-gradient(180deg, rgba(255,243,210,0.4), var(--color-bg-raised))",
          }}
        >
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-wax mb-2">
            Passphrases - write these down
          </p>
          <p className="p-body max-w-[480px] mb-4">
            One passphrase per nominee, shown here only once. Print them, hand
            them over in person, or store them somewhere safe out-of-band - this
            is how each person will open their archive.
          </p>
          <ul className="flex flex-col gap-4">
            {props.passphrases.map((p) => (
              <PassphraseRow key={p.name} name={p.name} passphrase={p.passphrase} />
            ))}
          </ul>
        </article>
      )}

      {props.loading && (
        <div className="rounded-[14px] border border-rule p-6 bg-bg-raised flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-wax animate-pulse" />
          <span className="font-serif italic text-[15px] text-ink-soft">
            Heirloom is composing some moments to begin with…
          </span>
        </div>
      )}

      {!props.loading && props.drafts && props.drafts.length === 0 && (
        <div className="rounded-[14px] border border-rule p-6 bg-bg-raised">
          <p className="font-serif italic text-[15px] text-ink-soft mb-3">
            We couldn&rsquo;t generate prompts just now. You can skip this and
            add sealed letters from the archive later.
          </p>
          <button className="btn-ghost" onClick={props.onReload} type="button">
            Try again
          </button>
        </div>
      )}

      {props.drafts && props.drafts.length > 0 && (
        <div className="flex flex-col gap-4">
          {props.drafts.map((d, i) => (
            <LetterDraftCard
              key={i}
              draft={d}
              onChange={(body) => update(i, body)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <button className="btn-ghost" onClick={props.onBack} type="button">
          Back
        </button>
        <button
          className="btn"
          onClick={props.onComplete}
          disabled={props.submitting || props.loading}
        >
          {props.submitting
            ? "Finishing…"
            : filledCount > 0
              ? `Save ${filledCount} & continue`
              : "Skip and continue"}
        </button>
      </div>
    </div>
  );
}

function LetterDraftCard(props: {
  draft: Draft;
  onChange: (body: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasBody = props.draft.body.trim().length > 0;

  return (
    <article className="rounded-[14px] border border-rule bg-bg-raised p-4">
      <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-wax mb-1">
        For {props.draft.to} · {props.draft.trigger}
      </p>
      <p className="font-serif italic text-[17px] leading-[1.35] text-ink mb-3">
        {props.draft.prompt}
      </p>
      {expanded || hasBody ? (
        <textarea
          value={props.draft.body}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder="Begin when you're ready. A few lines is enough."
          rows={4}
          className="w-full font-serif text-[16px] leading-[1.55] text-ink bg-transparent outline-none border-t border-rule pt-3 resize-y placeholder:text-ink-muted placeholder:italic"
        />
      ) : (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setExpanded(true)}
        >
          + Write this one
        </button>
      )}
    </article>
  );
}

function PassphraseRow({ name, passphrase }: { name: string; passphrase: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(passphrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Fallback: select the code text so the user can long-press copy
    }
  }
  return (
    <li className="flex flex-col gap-1.5 border-b border-rule-soft pb-3 last:border-0 last:pb-0">
      <span className="font-serif italic text-[16px] text-ink">{name}</span>
      <div className="flex items-center gap-3">
        <code className="font-mono text-[13px] text-ink tracking-[0.03em] select-all break-all flex-1">
          {passphrase}
        </code>
        <button
          type="button"
          onClick={copy}
          className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted hover:text-ink border border-rule rounded-full px-3 py-1.5 shrink-0"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </li>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Citation = { capture_id: string; snippet: string };

type StreamState = {
  status: "idle" | "retrieving" | "grounded" | "ungrounded" | "answering" | "done" | "error";
  hitCount: number | null;
  topSimilarity: number | null;
  answer: string;
  claims: { text: string; citations: Citation[] }[];
};

const EMPTY_STATE: StreamState = {
  status: "idle",
  hitCount: null,
  topSimilarity: null,
  answer: "",
  claims: [],
};

export function ReflectionRoom() {
  const [question, setQuestion] = useState("");
  const [s, setS] = useState<StreamState>(EMPTY_STATE);
  const esRef = useRef<EventSource | null>(null);
  const [drawer, setDrawer] = useState<Citation | null>(null);

  useEffect(() => {
    return () => esRef.current?.close();
  }, []);

  async function ask() {
    const q = question.trim();
    if (!q) return;
    esRef.current?.close();
    setS({ ...EMPTY_STATE, status: "retrieving" });

    // EventSource doesn't support POST natively. We use a small fetch+stream
    // reader pattern instead.
    const ctrl = new AbortController();
    const res = await fetch("/api/reflect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: q }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      setS((p) => ({ ...p, status: "error" }));
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      // Each SSE event is `event: <name>\ndata: <json>\n\n`
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const ev = parseEvent(chunk);
        if (!ev) continue;
        handle(ev);
      }
    }
  }

  function handle(ev: { name: string; data: unknown }) {
    setS((prev) => {
      const next = { ...prev };
      switch (ev.name) {
        case "retrieved": {
          const d = ev.data as { hit_count: number; top_similarity: number };
          next.hitCount = d.hit_count;
          next.topSimilarity = d.top_similarity;
          break;
        }
        case "grounded": {
          const d = ev.data as { grounded: boolean };
          next.status = d.grounded ? "answering" : "ungrounded";
          break;
        }
        case "claim": {
          const d = ev.data as { index: number; text: string; citations: Citation[] };
          next.claims = [...next.claims, { text: d.text, citations: d.citations }];
          break;
        }
        case "answer_partial": {
          // Gemma streams the prose answer character-by-character. We
          // mirror it into state immediately so the user sees text
          // forming, not a 30 s whitespace gap.
          const d = ev.data as { text: string };
          if (typeof d.text === "string" && d.text.length > next.answer.length) {
            next.answer = d.text;
          }
          break;
        }
        case "answer": {
          const d = ev.data as { text: string };
          next.answer = d.text;
          break;
        }
        case "done": {
          next.status = "done";
          break;
        }
        case "error": {
          next.status = "error";
          break;
        }
      }
      return next;
    });
  }

  const showEmpty = s.status === "ungrounded" || s.answer === "I don't have that in the archive. Try asking another way?";
  const showAnswer = !!s.answer && !showEmpty;
  const citations = uniqueCitations(s.claims);
  // "Listening" = we know we have grounded matches, but the model hasn't
  // produced anything yet. Gemma 4 e4b can take 5–10s on first synthesis,
  // so this state needs to feel like the system is paying attention rather
  // than frozen.
  // Listening = we have grounded matches but Gemma hasn't produced
  // a single character yet. The moment ANY partial answer text lands
  // the skeleton goes away and the prose itself shows the model is
  // working.
  const isListening =
    s.status === "answering" && s.claims.length === 0 && s.answer.length === 0;

  return (
    <div className="flex-1 flex flex-col relative z-10">
      {/* Answer area */}
      <section className="flex-1 px-6 pt-8 pb-32 overflow-y-auto">
        {s.status === "idle" && (
          <div className="max-w-[420px] mx-auto text-center pt-24">
            <p className="font-serif italic text-[22px] leading-[1.4] text-ink-soft text-wrap-pretty">
              Ask anything. The archive will answer with their own words, or it
              won&rsquo;t answer at all.
            </p>
            <ul className="mt-10 flex flex-col gap-3">
              {SUGGESTED_PROMPTS.map((p) => (
                <li key={p}>
                  <button
                    className="font-serif italic text-[15px] text-ink-fade hover:text-ink-soft transition-colors"
                    onClick={() => {
                      setQuestion(p);
                    }}
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <AnimatePresence>
          {(s.status === "retrieving" || isListening) && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
              className="max-w-[560px] mx-auto pt-2"
            >
              <ProgressStatus
                state={s.status === "retrieving" ? "retrieving" : "listening"}
                hits={s.hitCount}
              />
              <SkeletonLines pulsing={isListening} />
            </motion.div>
          )}
        </AnimatePresence>

        {showEmpty && (
          <div className="max-w-[520px] mx-auto pt-8">
            <p className="font-serif text-[19px] leading-[1.55] text-ink-soft text-wrap-pretty italic">
              I don&rsquo;t have that in the archive. Try asking another way?
            </p>
          </div>
        )}

        {showAnswer && (
          <div className="max-w-[560px] mx-auto pt-2">
            <p className="font-serif text-[19px] leading-[1.55] text-ink text-wrap-pretty">
              {s.answer}
            </p>

            {citations.length > 0 && (
              <>
                <hr className="my-6 border-rule" />
                <p className="p-meta mb-3">
                  Drawn from {citations.length}{" "}
                  {citations.length === 1 ? "capture" : "captures"} ·{" "}
                  Tap to view the source
                </p>
                <ul className="flex flex-wrap gap-2">
                  {citations.map((c, i) => (
                    <li key={c.capture_id}>
                      <button
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-rule font-mono text-[11px] tracking-wider uppercase text-ink-soft hover:border-ink-muted bg-bg-raised transition-colors"
                        onClick={() => setDrawer(c)}
                      >
                        <sup className="text-wax">{i + 1}</sup>
                        capture {c.capture_id.slice(0, 8)}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      {/* Composer */}
      <form
        className="fixed bottom-0 left-0 right-0 px-6 pb-6 pt-3 bg-paper/95 backdrop-blur-sm border-t border-rule-soft z-20"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <div className="flex items-center gap-3 max-w-[560px] mx-auto">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What are you looking for?"
            className="flex-1 bg-transparent font-serif italic text-[17px] text-ink placeholder:text-ink-muted outline-none border-b border-rule focus:border-ink-muted py-2"
            disabled={s.status === "retrieving" || s.status === "answering"}
            autoFocus
          />
          <button
            type="submit"
            className="btn"
            disabled={!question.trim() || s.status === "retrieving" || s.status === "answering"}
          >
            Ask
          </button>
        </div>
      </form>

      {/* Citation drawer */}
      {drawer && (
        <div
          className="fixed inset-0 z-30 bg-black/30 flex items-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawer(null);
          }}
        >
          <div className="w-full bg-paper rounded-t-[24px] shadow-paper-3 max-h-[80dvh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="eyebrow">Source capture</p>
              <button
                className="text-ink-muted hover:text-ink p-1 px-2 rounded-md"
                onClick={() => setDrawer(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="font-serif italic text-[17px] leading-[1.6] text-ink-soft text-wrap-pretty">
              {drawer.snippet}
            </p>
            <p className="p-meta mt-4">
              capture id · {drawer.capture_id.slice(0, 8)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function parseEvent(chunk: string): { name: string; data: unknown } | null {
  let name = "message";
  let data = "";
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { name, data: JSON.parse(data) };
  } catch {
    return null;
  }
}

/** Calm progress hint between submit and first claim. Two phases:
 *  - retrieving: we're embedding + searching pgvector
 *  - listening:  matches found, Gemma 4 is composing the answer */
function ProgressStatus({
  state,
  hits,
}: {
  state: "retrieving" | "listening";
  hits: number | null;
}) {
  const dots = useBreathDot();
  const label =
    state === "retrieving"
      ? `Searching the archive${dots}`
      : `Found ${hits ?? "a few"} ${hits === 1 ? "memory" : "memories"}. Listening for an answer${dots}`;
  return (
    <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted mb-5">
      {label}
    </p>
  );
}

/** Soft pulsing line placeholders mirroring the shape of the final answer.
 *  Pulses at ~1.4 s (calm — matches the design system's breathing waveform
 *  cadence). When `pulsing` is false the bars stay flat (just present). */
function SkeletonLines({ pulsing }: { pulsing: boolean }) {
  return (
    <div className="flex flex-col gap-3 mt-2">
      {[88, 96, 72, 84, 62].map((w, i) => (
        <motion.div
          key={i}
          className="h-[14px] rounded-[4px]"
          style={{ width: `${w}%`, background: "var(--color-rule)" }}
          animate={
            pulsing
              ? { opacity: [0.35, 0.7, 0.35] }
              : { opacity: 0.45 }
          }
          transition={{
            duration: 1.6,
            ease: "easeInOut",
            repeat: pulsing ? Infinity : 0,
            delay: i * 0.12,
          }}
        />
      ))}
    </div>
  );
}

/** Three dots that cycle every 500 ms — calmer than a real spinner. */
function useBreathDot(): string {
  const [n, setN] = useState(1);
  useEffect(() => {
    const id = window.setInterval(() => setN((v) => (v % 3) + 1), 500);
    return () => clearInterval(id);
  }, []);
  return ".".repeat(n);
}

function uniqueCitations(
  claims: { citations: Citation[] }[],
): Citation[] {
  const seen = new Map<string, Citation>();
  for (const c of claims) {
    for (const cit of c.citations) {
      if (!seen.has(cit.capture_id)) seen.set(cit.capture_id, cit);
    }
  }
  return Array.from(seen.values());
}

const SUGGESTED_PROMPTS = [
  "Tell me about your grandmother.",
  "What did you learn from your father?",
  "What did you wear when you got married?",
];

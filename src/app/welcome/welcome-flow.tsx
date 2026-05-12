"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Envelope } from "./envelope";

type Stage =
  | "envelope" //  closed envelope + passphrase input
  | "opening" //   flap (with seal still stuck to it) rotates up
  | "emerging" //  letter slides up out of envelope
  | "unfolding" // letter unfurls
  | "reading" //   letter is open, intro readable
  | "leaving"; // intro scrolls away as we navigate

const EASE_FOLD: [number, number, number, number] = [0.55, 0.05, 0.25, 1];
const EASE_PAPER: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

export function WelcomeFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Dev debug: ?stage=opening|emerging|unfolding|reading freezes the page
  // at that stage so each animation frame can be inspected/screenshotted.
  const frozenStage = searchParams.get("stage") as Stage | null;
  const [stage, setStage] = useState<Stage>(frozenStage ?? "envelope");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [letter, setLetter] = useState<{
    from_name: string;
    to_name: string;
    body: string;
  } | null>(
    frozenStage
      ? {
          from_name: "Elena",
          to_name: "Maya",
          body:
            "Maya — there is something here for you.\n\nTake your time with this. There is no rush, and nothing in here is going anywhere.\n\nI love you.\n\n— Elena",
        }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  async function unlock() {
    const v = passphrase.trim();
    if (!v || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/nominee-passphrase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase: v }),
      });
      if (!r.ok) {
        setError("That isn't the right passphrase. Try again, or contact the executor.");
        setShake((n) => n + 1);
        setBusy(false);
        return;
      }
      const data = (await r.json()) as {
        nominee: { name: string; letter_body: string | null };
      };
      const me = await fetch("/api/me/home", { cache: "no-store" }).then((r) => r.json());
      setLetter({
        from_name: me?.framing?.from_name ?? "the creator",
        to_name: data.nominee.name,
        body: data.nominee.letter_body ?? "There is something here for you.",
      });

      // Choreograph: flap lifts (seal still stuck to it) → letter rises out
      // of the envelope → letter unfolds → reading. Total ~3.5 s.
      setStage("opening");
      window.setTimeout(() => setStage("emerging"), 1200);
      window.setTimeout(() => setStage("unfolding"), 2200);
      window.setTimeout(() => setStage("reading"), 3500);
    } finally {
      // busy stays true through the choreography
    }
  }

  function enterArchive() {
    setStage("leaving");
    window.setTimeout(() => router.push("/"), 600);
  }

  return (
    <main className="stage relative min-h-dvh overflow-hidden flex flex-col items-center justify-center px-6">
      {/* The envelope is mounted for all stages except reading-final; the
          letter content takes over once the unfold completes. */}
      <AnimatePresence>
        {stage !== "reading" && stage !== "leaving" && (
          <motion.div
            key="envelope-wrap"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ duration: 0.7, ease: EASE_PAPER }}
            className="relative z-10 flex flex-col items-center"
            style={{ perspective: 1400 }}
          >
            <motion.div
              animate={
                shake > 0
                  ? { x: [0, -8, 8, -6, 6, -3, 3, 0] }
                  : { x: 0 }
              }
              transition={{ duration: 0.45, ease: "easeOut" }}
              key={`shake-${shake}`}
            >
              <Envelope stage={stage} letter={letter} />
            </motion.div>

            {stage === "envelope" && (
              <motion.div
                key="passphrase"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.6, ease: EASE_PAPER, delay: 0.2 }}
                className="mt-12 flex flex-col items-center gap-2 w-full max-w-[300px]"
              >
                <p className="eyebrow mb-3">A passphrase, please</p>
                <input
                  type="password"
                  autoFocus
                  className="input text-center"
                  placeholder="the words you were told"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") unlock();
                  }}
                  disabled={busy}
                  aria-invalid={error ? "true" : "false"}
                  aria-describedby="passphrase-error"
                />
                <button
                  className="btn mt-6"
                  onClick={unlock}
                  disabled={!passphrase.trim() || busy}
                >
                  {busy ? "Opening…" : "Open"}
                </button>
                {error && (
                  <p
                    id="passphrase-error"
                    className="p-body text-wax mt-4 text-center max-w-[280px]"
                  >
                    {error}
                  </p>
                )}
                <p className="p-meta mt-6">This is local to your device.</p>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Letter content takes over the screen once the unfold completes.
          Eyebrow + "Enter" button stay centered for ceremony; the prose
          body is left-aligned at a comfortable measure (~48ch) so the
          serif reads as a letter rather than concrete poetry. */}
      <AnimatePresence>
        {(stage === "reading" || stage === "leaving") && letter && (
          <motion.section
            key="letter-content"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: stage === "leaving" ? 0 : 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.9, ease: EASE_PAPER }}
            className="relative z-10 w-full max-w-[440px] flex flex-col items-center px-2"
          >
            <p className="p-meta mb-8 text-center">
              From {letter.from_name} · For {letter.to_name}
            </p>

            <article
              className="font-serif text-[18px] leading-[1.65] text-ink-soft self-stretch space-y-5"
              style={{ textWrap: "pretty" }}
            >
              {letter.body
                .split(/\n\s*\n/)
                .map((para, i) => (
                  <p key={i}>{para.replace(/\s*\n\s*/g, " ")}</p>
                ))}
            </article>

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.6 }}
              className="btn mt-16"
              onClick={enterArchive}
            >
              Enter the archive
            </motion.button>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Soft ambient hint that this is local */}
      <p className="p-meta absolute bottom-6 left-0 right-0 text-center z-0">
        Local-first · Nothing leaves this device
      </p>
    </main>
  );
}

// Used by the envelope component
export type { Stage };
export { EASE_FOLD, EASE_PAPER };

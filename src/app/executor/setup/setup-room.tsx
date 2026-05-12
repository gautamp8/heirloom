"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function SetupRoom() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    passphrase: string;
    letter_body: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/executor/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(
          d?.error?.code === "no_nominee_designate_one_first"
            ? "Designate at least one nominee before setting up an executor."
            : "Couldn't generate the passphrase. Try again.",
        );
        return;
      }
      const data = (await r.json()) as {
        passphrase: string;
        letter_body: string;
      };
      setResult(data);
    } finally {
      setBusy(false);
    }
  }

  async function copyAll() {
    if (!result) return;
    await navigator.clipboard.writeText(result.letter_body);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="w-full max-w-[460px] flex flex-col items-center">
      <AnimatePresence mode="wait">
        {!result ? (
          <motion.div
            key="generate"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center"
          >
            <button
              className="btn"
              onClick={generate}
              disabled={busy}
            >
              {busy ? "Generating…" : "Generate a passphrase"}
            </button>
            {error && (
              <p className="p-body text-wax mt-6 text-center">{error}</p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
            className="flex flex-col items-center w-full"
          >
            <p className="eyebrow mb-3">This passphrase is shown only once</p>
            <div
              className="rounded-[14px] border border-rule px-5 py-4 bg-paper-2 mb-6 w-full text-center"
              style={{ boxShadow: "var(--shadow-paper-1)" }}
            >
              <p className="font-serif text-[22px] tracking-wide text-ink text-wrap-pretty">
                {result.passphrase}
              </p>
            </div>

            <p className="p-meta mb-2">The letter to print</p>
            <pre
              className="self-stretch font-serif text-[14px] leading-[1.55] text-ink-soft whitespace-pre-wrap text-left p-5 bg-bg-raised rounded-[14px] border border-rule-soft"
              style={{ textWrap: "pretty" }}
            >
              {result.letter_body}
            </pre>

            <div className="flex items-center gap-3 mt-6">
              <button className="btn" onClick={() => window.print()}>
                Print
              </button>
              <button className="btn-ghost" onClick={copyAll}>
                {copied ? "Copied" : "Copy letter"}
              </button>
            </div>

            <p className="p-meta mt-10 max-w-[400px] text-center">
              Heirloom won&rsquo;t remember this passphrase. Hand the letter to
              someone you trust, or keep it somewhere safe yourself.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

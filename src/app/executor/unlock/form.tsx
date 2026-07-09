"use client";

import { useState } from "react";
import { motion } from "framer-motion";

export function UnlockForm() {
  const [hint, setHint] = useState("");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ released: number } | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!hint.trim() || !phrase.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/executor/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vault_email_hint: hint.trim(),
          passphrase: phrase,
        }),
      });
      if (r.status === 429) {
        setError("Too many attempts. Wait an hour and try again.");
        setShake((n) => n + 1);
        return;
      }
      if (r.status === 423) {
        setError("This passphrase is no longer valid. Please contact the creator if they’re available.");
        return;
      }
      if (!r.ok) {
        setError(
          "That isn’t the right passphrase, or the creator’s email hint doesn’t match. Try again.",
        );
        setShake((n) => n + 1);
        return;
      }
      const data = (await r.json()) as { released: number };
      setResult(data);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
        className="w-full max-w-[400px] flex flex-col items-center text-center"
      >
        <p className="font-serif italic text-[22px] text-sepia mb-4">
          It&rsquo;s done.
        </p>
        <p className="p-body">
          {result.released === 0
            ? "Everything had already been released. The nominees can access the archive whenever they're ready."
            : `${result.released} ${result.released === 1 ? "piece has" : "pieces have"} been released to the nominees. They can open the archive whenever they're ready.`}
        </p>
        <p className="p-meta mt-10">You can close this page now.</p>
      </motion.div>
    );
  }

  return (
    <motion.form
      onSubmit={submit}
      animate={
        shake > 0 ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : { x: 0 }
      }
      transition={{ duration: 0.45, ease: "easeOut" }}
      key={`shake-${shake}`}
      className="w-full max-w-[360px] flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1.5 self-stretch text-left">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
          The creator&rsquo;s email
        </span>
        <input
          className="input"
          type="text"
          placeholder="A hint, not the full address"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          autoComplete="off"
          disabled={busy}
        />
      </label>
      <label className="flex flex-col gap-1.5 self-stretch text-left">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
          The passphrase
        </span>
        <input
          className="input"
          type="text"
          placeholder="willow · bread · river · 14"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          autoComplete="off"
          disabled={busy}
        />
      </label>

      <button
        type="submit"
        className="btn mt-4 self-center"
        disabled={!hint.trim() || !phrase.trim() || busy}
      >
        {busy ? "Releasing…" : "Release the archive"}
      </button>

      {error && (
        <p role="alert" className="p-body text-wax text-center mt-4">
          {error}
        </p>
      )}
    </motion.form>
  );
}

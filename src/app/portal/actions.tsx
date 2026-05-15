"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PortalActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function begin() {
    setBusy(true);
    try {
      const r = await fetch("/api/dev/bootstrap", { method: "POST" });
      if (!r.ok) {
        alert("Bootstrap failed");
        return;
      }
      const d = (await r.json()) as { passphrase: string | null };
      if (d.passphrase) {
        setIssued(d.passphrase);
      } else {
        router.push("/");
      }
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  if (issued) {
    return (
      <div className="flex flex-col items-center gap-4 relative z-10 max-w-[360px] mx-auto">
        <p className="eyebrow text-wax">Your archive key</p>
        <p className="font-serif italic text-[15px] text-ink-soft text-center text-wrap-pretty">
          Write this down. You&rsquo;ll need it to come back to this archive
          after signing out. The key is local to this device and never
          leaves it.
        </p>
        <code className="font-mono text-[15px] text-ink select-all text-center break-words border border-rule rounded-[10px] px-4 py-3 bg-bg-raised w-full">
          {issued}
        </code>
        <button
          type="button"
          onClick={copy}
          className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted hover:text-ink underline"
        >
          {copied ? "Copied" : "Copy to clipboard"}
        </button>
        <button
          className="btn mt-2"
          onClick={() => {
            setIssued(null);
            router.push("/");
          }}
        >
          I&rsquo;ve written it down
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 relative z-10">
      <button
        className="btn btn-full max-w-[260px] disabled:opacity-60"
        onClick={begin}
        disabled={busy}
      >
        {busy ? "Opening…" : "Begin a new archive"}
      </button>
      <button className="btn-ghost" onClick={() => router.push("/welcome")}>
        I have a passphrase
      </button>
      <p className="p-meta mt-3">Local-first · Nothing leaves this device</p>
    </div>
  );
}

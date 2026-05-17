"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "menu" | "issued" | "import";

export function PortalActions() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("menu");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [bundle, setBundle] = useState<File | null>(null);
  const [bundlePass, setBundlePass] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
        setMode("issued");
      } else {
        router.push("/");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitImport(e: React.FormEvent) {
    e.preventDefault();
    if (!bundle) {
      setImportErr("Choose a .hloom bundle first.");
      return;
    }
    if (bundlePass.trim().length < 6) {
      setImportErr("The bundle passphrase is at least 6 characters.");
      return;
    }
    setImportErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", bundle);
      fd.append("passphrase", bundlePass);
      const r = await fetch("/api/portal/import", {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        const code = r.status === 401 ? "wrong_passphrase" : "import_failed";
        setImportErr(
          code === "wrong_passphrase"
            ? "Couldn't unlock the bundle. Check the passphrase."
            : "Import failed. The bundle may be corrupt.",
        );
        return;
      }
      const d = (await r.json()) as { passphrase: string | null };
      if (d.passphrase) {
        setIssued(d.passphrase);
        setMode("issued");
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

  if (mode === "issued" && issued) {
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

  if (mode === "import") {
    return (
      <form
        onSubmit={submitImport}
        className="flex flex-col items-stretch gap-4 relative z-10 max-w-[360px] w-full mx-auto"
      >
        <p className="eyebrow text-wax text-center">Import an archive</p>
        <p className="font-serif italic text-[14px] text-ink-soft text-center">
          Open a <code>.hloom</code> bundle exported from another device.
          The bundle stays on this device and is unlocked locally.
        </p>
        <button
          type="button"
          className="btn-ghost w-full text-left border border-rule rounded-[10px] px-4 py-3 bg-bg-raised"
          onClick={() => fileRef.current?.click()}
        >
          {bundle ? bundle.name : "Choose .hloom file"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".hloom,application/octet-stream"
          className="hidden"
          onChange={(e) => setBundle(e.target.files?.[0] ?? null)}
        />
        <input
          type="password"
          autoComplete="off"
          placeholder="Bundle passphrase"
          value={bundlePass}
          onChange={(e) => setBundlePass(e.target.value)}
          className="border border-rule rounded-[10px] px-4 py-3 bg-bg-raised font-mono text-[15px]"
        />
        {importErr && (
          <p className="p-meta text-[13px] text-clay text-center">
            {importErr}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-full disabled:opacity-60"
          disabled={busy}
        >
          {busy ? "Unlocking…" : "Unlock and import"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setMode("menu");
            setImportErr(null);
          }}
        >
          Back
        </button>
      </form>
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
      <button className="btn-ghost" onClick={() => setMode("import")}>
        Import an existing archive
      </button>
      <p className="p-meta mt-3">Local-first · Nothing leaves this device</p>
    </div>
  );
}

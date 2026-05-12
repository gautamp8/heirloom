"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PortalActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true);
    try {
      const r = await fetch("/api/dev/bootstrap", { method: "POST" });
      if (r.ok) router.push("/");
      else alert("Bootstrap failed");
    } finally {
      setBusy(false);
    }
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
        I have a sealed letter
      </button>
      <p className="p-meta mt-3">Local-first · Nothing leaves this device</p>
    </div>
  );
}

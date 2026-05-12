"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Snapshot = {
  current_role: "creator" | "nominee" | null;
  current_name: string | null;
  captures: number;
  nominees: number;
  released: number;
  reflections: number;
  has_executor: boolean;
};

export function DevControls({ snapshot }: { snapshot: Snapshot }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(
    label: string,
    method: "POST",
    url: string,
    body?: object,
  ) {
    setBusy(label);
    setMsg(null);
    try {
      const r = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(`${label}: ${d?.error?.code ?? r.status}`);
        return null;
      }
      return d;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Current session */}
      <section
        className="rounded-[14px] border border-rule p-5 bg-bg-raised"
        style={{ boxShadow: "var(--shadow-paper-1)" }}
      >
        <p className="eyebrow mb-2">Current session</p>
        <p className="font-serif text-[20px] text-ink">
          {snapshot.current_role ? (
            <>
              <em className="italic text-wax">
                {snapshot.current_name ?? "—"}
              </em>{" "}
              <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-ink-muted ml-2">
                {snapshot.current_role}
              </span>
            </>
          ) : (
            <span className="text-ink-muted">No session</span>
          )}
        </p>

        <div className="flex flex-wrap gap-2 mt-5">
          <button
            className="btn"
            disabled={!!busy}
            onClick={async () => {
              const r = await call("creator", "POST", "/api/dev/bootstrap");
              if (r) router.push("/");
            }}
          >
            {busy === "creator" ? "Opening…" : "Become Elena (creator)"}
          </button>
          <button
            className="btn"
            disabled={!!busy}
            onClick={async () => {
              const r = await call("nominee", "POST", "/api/dev/nominee");
              if (r) router.push("/");
            }}
          >
            {busy === "nominee" ? "Opening…" : "Become Maya (nominee)"}
          </button>
          <button
            className="btn-ghost"
            disabled={!!busy}
            onClick={async () => {
              await call("signout", "POST", "/api/dev/sign-out");
              router.refresh();
            }}
          >
            Sign out
          </button>
        </div>
      </section>

      {/* Stats */}
      <section>
        <p className="eyebrow mb-3">Vault state</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Captures" n={snapshot.captures} />
          <Stat label="Nominees" n={snapshot.nominees} />
          <Stat label="Released" n={snapshot.released} />
          <Stat label="Reflections" n={snapshot.reflections} />
        </ul>
      </section>

      {/* Surfaces */}
      <section>
        <p className="eyebrow mb-3">Creator surfaces</p>
        <Grid>
          <Nav href="/portal" label="Portal" hint="Seal + Begin" />
          <Nav href="/" label="Creator home" hint="Greeting, prompt, captures" />
          <Nav href="/reflect" label="Reflection" hint="Ask the archive" />
          <Nav href="/executor/setup" label="Executor setup" hint="Generate passphrase" />
        </Grid>
      </section>

      <section>
        <p className="eyebrow mb-3">Nominee surfaces</p>
        <Grid>
          <Nav href="/welcome" label="Welcome" hint="Envelope + passphrase: the long road home" />
          <Nav href="/" label="Nominee home" hint="Framing, latest hero" />
          <Nav href="/reflect" label="Reflection" hint="Ask, grounded answers" />
        </Grid>
      </section>

      <section>
        <p className="eyebrow mb-3">Executor surface</p>
        <Grid>
          <Nav href="/executor/unlock" label="Executor unlock" hint="Public; enter hint + passphrase" />
        </Grid>
      </section>

      <section>
        <p className="eyebrow mb-3">Welcome animation — frozen stages</p>
        <Grid>
          <Nav href="/welcome?stage=opening" label="Stage 1 · Opening" hint="Flap lifting" />
          <Nav href="/welcome?stage=emerging" label="Stage 2 · Emerging" hint="Letter rising" />
          <Nav href="/welcome?stage=unfolding" label="Stage 3 · Unfolding" hint="Letter content" />
          <Nav href="/welcome?stage=reading" label="Stage 4 · Reading" hint="Final letter view" />
        </Grid>
      </section>

      {/* Danger zone */}
      <section className="border-t border-rule pt-8 mt-4">
        <p className="eyebrow mb-3">Reset</p>
        <p className="p-body mb-4 max-w-[440px]">
          Truncates every capture, transcript, chunk, tag, reflection,
          nominee, release, and executor credential. Users + vaults are
          kept so IDs stay stable.
        </p>
        <button
          className="btn"
          style={{ background: "var(--color-wax)" }}
          disabled={!!busy}
          onClick={async () => {
            if (!confirm("Wipe all captures + reflections + nominees?")) return;
            await call("reset", "POST", "/api/dev/reset");
            router.refresh();
          }}
        >
          {busy === "reset" ? "Resetting…" : "Reset the vault"}
        </button>
      </section>

      {msg && <p className="p-body text-wax">{msg}</p>}
    </div>
  );
}

function Stat({ label, n }: { label: string; n: number }) {
  return (
    <li className="rounded-[12px] border border-rule p-4 bg-bg-raised flex flex-col gap-1">
      <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
        {label}
      </span>
      <span className="font-serif text-[24px] text-ink leading-none">{n}</span>
    </li>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</ul>;
}

function Nav({
  href,
  label,
  hint,
}: {
  href: string;
  label: string;
  hint: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-[12px] border border-rule p-4 bg-bg-raised hover:border-ink-muted transition-colors"
      >
        <p className="font-serif text-[16px] text-ink">{label}</p>
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-muted mt-1">
          {hint}
        </p>
      </Link>
    </li>
  );
}

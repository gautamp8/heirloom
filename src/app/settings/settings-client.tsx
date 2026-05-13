"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LifeEvent = {
  id: string;
  kind: string;
  label: string;
  event_date: string | null;
  recurrence: string | null;
};

type NomineeRow = {
  id: string;
  name: string;
  relationship: string | null;
  email: string | null;
  has_passphrase: boolean;
  passphrase_set_at: string | null;
};

type Initial = {
  user: { display_name: string };
  life_events: LifeEvent[];
  nominees: NomineeRow[];
};

const EVENT_KINDS = [
  { value: "birth", label: "Birthday" },
  { value: "anniversary", label: "Anniversary" },
  { value: "wedding", label: "Wedding" },
  { value: "graduation", label: "Graduation" },
  { value: "loss", label: "Loss" },
  { value: "milestone", label: "Milestone" },
];

export function SettingsClient({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [name, setName] = useState(initial.user.display_name);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  async function saveName() {
    if (!name.trim() || name.trim() === initial.user.display_name) return;
    setSavingName(true);
    setNameSaved(false);
    try {
      const r = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_name: name.trim() }),
      });
      if (r.ok) setNameSaved(true);
    } finally {
      setSavingName(false);
    }
  }

  return (
    <div className="flex flex-col gap-12">
      {/* You ============================================================ */}
      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">You</h2>
        <div className="flex flex-col gap-2 max-w-[420px]">
          <label className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
            Your name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameSaved(false);
            }}
            onBlur={saveName}
            maxLength={60}
            className="w-full font-serif text-[22px] font-light text-ink bg-transparent border-b border-rule-strong outline-none focus:border-ink py-2"
            aria-label="Display name"
          />
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-fade min-h-[14px]">
            {savingName
              ? "Saving…"
              : nameSaved
                ? "Saved"
                : name.trim() !== initial.user.display_name
                  ? "Press tab or click outside to save"
                  : ""}
          </p>
        </div>
      </section>

      {/* Important dates =============================================== */}
      <LifeEventsSection initial={initial.life_events} onChanged={() => router.refresh()} />

      {/* Nominees ====================================================== */}
      <NomineesSection initial={initial.nominees} onChanged={() => router.refresh()} />

      {/* Vault ========================================================= */}
      <section className="flex flex-col gap-4">
        <h2 className="eyebrow">Vault</h2>
        <p className="p-body max-w-[480px]">
          Export the entire archive as a single passphrase-encrypted
          <code className="font-mono text-[13px] text-ink mx-1">.hloom</code>
          file. The recipient can import it into their own Heirloom and the
          archive lives on their hardware afterward — no cloud roundtrip
          needed.
        </p>
        <details className="rounded-[12px] border border-rule p-4 bg-bg-raised max-w-[520px]">
          <summary className="font-serif italic text-[15px] text-ink cursor-pointer">
            Export &middot; details
          </summary>
          <p className="p-meta mt-2">
            Command line: POST <code className="font-mono">/api/vault/export</code>{" "}
            with JSON{" "}
            <code className="font-mono">&#123;&quot;passphrase&quot;:&nbsp;...&#125;</code>{" "}
            returns the bundle. UI affordance coming next.
          </p>
        </details>
      </section>
    </div>
  );
}

/* ================================================================
   Important dates
   ================================================================ */

function LifeEventsSection({
  initial,
  onChanged,
}: {
  initial: LifeEvent[];
  onChanged: () => void;
}) {
  const [items, setItems] = useState(initial);
  const [adding, setAdding] = useState(false);

  async function remove(id: string) {
    setItems((curr) => curr.filter((e) => e.id !== id));
    await fetch(`/api/life-events/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="eyebrow">Important dates</h2>
        {!adding && (
          <button className="btn-ghost" onClick={() => setAdding(true)}>
            + Add another
          </button>
        )}
      </div>

      {items.length === 0 && !adding && (
        <p className="p-body text-ink-muted">
          No dates yet. Add the ones that anchor your story.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((e) => (
          <li
            key={e.id}
            className="flex items-center justify-between rounded-[12px] border border-rule p-3 bg-bg-raised"
          >
            <div className="min-w-0 flex-1">
              <p className="font-serif text-[16px] text-ink leading-tight">
                {e.label}
              </p>
              <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mt-0.5">
                {prettyKind(e.kind)}
                {e.event_date && <> · {formatDate(e.event_date)}</>}
                {e.recurrence === "yearly" && <> · Every year</>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(e.id)}
              className="text-ink-muted hover:text-wax text-[18px] ml-3"
              aria-label={`Remove ${e.label}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {adding && (
        <AddLifeEventForm
          onSaved={(e) => {
            setAdding(false);
            setItems([...items, e]);
            onChanged();
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </section>
  );
}

function AddLifeEventForm({
  onSaved,
  onCancel,
}: {
  onSaved: (e: LifeEvent) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("birth");
  const [date, setDate] = useState("");
  const [recurrence, setRecurrence] = useState<"yearly" | "once">("yearly");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/life-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          kind,
          event_date: date || null,
          recurrence,
        }),
      });
      if (r.ok) {
        // We don't get the id back from this minimal endpoint — onChanged
        // will refresh the server data so the new row appears with its id.
        // Stub it locally so the optimistic UI doesn't flash empty.
        onSaved({
          id: `tmp-${Date.now()}`,
          label: label.trim(),
          kind,
          event_date: date || null,
          recurrence,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[12px] border border-rule p-3 bg-bg-raised grid grid-cols-1 sm:grid-cols-[1fr_140px_140px_auto] gap-2 items-end">
      <div className="flex flex-col gap-1">
        <label className="eyebrow text-[9px]">Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="My wedding day"
          maxLength={80}
          className="font-serif text-[16px] text-ink bg-transparent outline-none border-b border-rule placeholder:text-ink-muted placeholder:italic"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="eyebrow text-[9px]">Kind</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
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
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="font-mono text-[12px] text-ink bg-transparent outline-none border-b border-rule py-1"
        />
      </div>
      <div className="flex gap-2 self-end">
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn"
          onClick={save}
          disabled={busy || !label.trim()}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   Nominees + passphrase regeneration
   ================================================================ */

function NomineesSection({
  initial,
  onChanged,
}: {
  initial: NomineeRow[];
  onChanged: () => void;
}) {
  const [items, setItems] = useState(initial);
  const [adding, setAdding] = useState(false);
  // Map nominee_id -> just-revealed plaintext passphrase. Shown once,
  // never persisted. The user must copy it down.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  // Map nominee_id -> in-flight confirmation (inline, two-step instead
  // of a native confirm() dialog that races with React state updates).
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function regenerate(id: string) {
    setBusy(id);
    setConfirming(null);
    try {
      const r = await fetch(`/api/nominees/${id}/passphrase`, { method: "POST" });
      if (!r.ok) return;
      const d = (await r.json()) as { passphrase: string };
      setRevealed((curr) => ({ ...curr, [id]: d.passphrase }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="eyebrow">Nominees</h2>
        {!adding && (
          <button className="btn-ghost" onClick={() => setAdding(true)}>
            + Add another
          </button>
        )}
      </div>

      {items.length === 0 && !adding && (
        <p className="p-body text-ink-muted">
          No one yet. Add the people you want this archive to reach.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((n) => (
          <li
            key={n.id}
            className="rounded-[12px] border border-rule p-4 bg-bg-raised flex flex-col gap-2"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="font-serif text-[18px] text-ink leading-tight">
                  {n.name}
                </p>
                {n.relationship && (
                  <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mt-0.5">
                    {n.relationship}
                  </p>
                )}
              </div>
              {confirming === n.id ? (
                <div className="flex items-center gap-2">
                  <button
                    className="btn-ghost text-ink-muted"
                    onClick={() => setConfirming(null)}
                    disabled={busy === n.id}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn"
                    style={{ background: "var(--color-wax)" }}
                    onClick={() => regenerate(n.id)}
                    disabled={busy === n.id}
                  >
                    {busy === n.id
                      ? "Generating…"
                      : n.has_passphrase
                        ? "Yes, replace it"
                        : "Generate"}
                  </button>
                </div>
              ) : (
                <button
                  className="btn-ghost"
                  onClick={() => setConfirming(n.id)}
                  disabled={busy === n.id}
                >
                  {n.has_passphrase
                    ? "New passphrase"
                    : "Generate passphrase"}
                </button>
              )}
            </div>
            {confirming === n.id && n.has_passphrase && (
              <p className="font-serif italic text-[13px] text-ink-soft mt-1">
                The current passphrase will stop working. {n.name} will need
                the new one to open the archive.
              </p>
            )}
            {revealed[n.id] && (
              <div
                className="rounded-[10px] border p-3 mt-1 flex flex-col gap-1"
                style={{
                  borderColor: "var(--color-wax)",
                  background:
                    "linear-gradient(180deg, rgba(255,243,210,0.4), var(--color-bg-raised))",
                }}
              >
                <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-wax">
                  Write this down — shown only once
                </p>
                <code className="font-mono text-[16px] text-ink select-all">
                  {revealed[n.id]}
                </code>
                <p className="font-serif italic text-[13px] text-ink-soft mt-1">
                  Hand this to {n.name} however feels right — printed, written,
                  in person. The previous passphrase no longer works.
                </p>
              </div>
            )}
            {n.has_passphrase && !revealed[n.id] && (
              <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-fade">
                Passphrase set
                {n.passphrase_set_at && <> · {formatDateLong(n.passphrase_set_at)}</>}
              </p>
            )}
          </li>
        ))}
      </ul>

      {adding && (
        <AddNomineeForm
          onSaved={(n, passphrase) => {
            setAdding(false);
            setItems([...items, n]);
            setRevealed((curr) => ({ ...curr, [n.id]: passphrase }));
            onChanged();
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </section>
  );
}

function AddNomineeForm({
  onSaved,
  onCancel,
}: {
  onSaved: (n: NomineeRow, passphrase: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [birthday, setBirthday] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/nominees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          relation: relation.trim() || null,
          birthday: birthday || null,
        }),
      });
      if (r.ok) {
        const d = (await r.json()) as {
          nominee: { id: string; name: string; passphrase: string };
        };
        onSaved(
          {
            id: d.nominee.id,
            name: d.nominee.name,
            relationship: relation.trim() || null,
            email: null,
            has_passphrase: true,
            passphrase_set_at: new Date().toISOString(),
          },
          d.nominee.passphrase,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[12px] border border-rule p-3 bg-bg-raised grid grid-cols-1 sm:grid-cols-[1fr_140px_140px_auto] gap-2 items-end">
      <div className="flex flex-col gap-1">
        <label className="eyebrow text-[9px]">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Maya"
          maxLength={60}
          className="font-serif text-[16px] text-ink bg-transparent outline-none border-b border-rule placeholder:text-ink-muted placeholder:italic"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="eyebrow text-[9px]">Relation</label>
        <input
          type="text"
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          placeholder="daughter"
          maxLength={40}
          className="font-sans text-[14px] text-ink bg-transparent outline-none border-b border-rule placeholder:text-ink-muted"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="eyebrow text-[9px]">Birthday</label>
        <input
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          className="font-mono text-[12px] text-ink bg-transparent outline-none border-b border-rule py-1"
        />
      </div>
      <div className="flex gap-2 self-end">
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn"
          onClick={save}
          disabled={busy || !name.trim()}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   Formatting helpers
   ================================================================ */

function prettyKind(kind: string): string {
  switch (kind) {
    case "birth":
      return "Birthday";
    case "anniversary":
      return "Anniversary";
    case "wedding":
      return "Wedding";
    case "graduation":
      return "Graduation";
    case "loss":
      return "Loss";
    default:
      return "Milestone";
  }
}

function formatDate(iso: string): string {
  // iso = YYYY-MM-DD
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

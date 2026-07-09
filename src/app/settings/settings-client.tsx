"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VOICE_SCRIPT, webmBlobToWav } from "@/lib/voice-record";
import { NotificationsSection, SignOutSection } from "./sections";

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
  has_photo: boolean;
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
  const [nameError, setNameError] = useState(false);

  async function saveName() {
    if (!name.trim() || name.trim() === initial.user.display_name) return;
    setSavingName(true);
    setNameSaved(false);
    setNameError(false);
    try {
      const r = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_name: name.trim() }),
      });
      if (r.ok) setNameSaved(true);
      else setNameError(true);
    } catch {
      setNameError(true);
    } finally {
      setSavingName(false);
    }
  }

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">You</h2>
        <div className="flex flex-col gap-2 max-w-[420px]">
          <label htmlFor="display-name" className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
            Your name
          </label>
          <input
            id="display-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameSaved(false);
              setNameError(false);
            }}
            onBlur={saveName}
            maxLength={60}
            className="w-full font-serif text-[22px] font-light text-ink bg-transparent border-b border-rule-strong outline-none focus:border-ink py-2"
          />
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-fade min-h-[14px]">
            {savingName
              ? "Saving…"
              : nameError
                ? "Couldn’t save — try again"
                : nameSaved
                  ? "Saved"
                  : name.trim() !== initial.user.display_name
                    ? "Press tab or click outside to save"
                    : ""}
          </p>
        </div>
      </section>

      <LifeEventsSection initial={initial.life_events} onChanged={() => router.refresh()} />

      <NomineesSection initial={initial.nominees} onChanged={() => router.refresh()} />

      <VoiceSection />

      <SelfieSection />

      <ArchiveKeySection />

      <NotificationsSection />

      <ProviderSection />

      <VaultSection />

      <SignOutSection />
    </div>
  );
}

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
              className="inline-flex items-center justify-center w-11 h-11 -mr-2 text-ink-muted hover:text-wax text-[18px] ml-1"
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
  const [recurrence] = useState<"yearly" | "once">("yearly");
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
        // The endpoint doesn't return the id; onChanged refreshes after,
        // this stub is only to avoid an empty row flash.
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
        <label htmlFor="life-label" className="eyebrow text-[9px]">Label</label>
        <input
          id="life-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="My wedding day"
          maxLength={80}
          className="font-serif text-[16px] text-ink bg-transparent outline-none border-b border-rule focus:border-ink placeholder:text-ink-muted placeholder:italic"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="life-kind" className="eyebrow text-[9px]">Kind</label>
        <select
          id="life-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="font-sans text-[14px] text-ink bg-transparent outline-none border-b border-rule focus:border-ink py-1"
        >
          {EVENT_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="life-date" className="eyebrow text-[9px]">Date</label>
        <input
          id="life-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="font-mono text-[12px] text-ink bg-transparent outline-none border-b border-rule focus:border-ink py-1"
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
                  Write this down &mdash; shown only once
                </p>
                <code className="font-mono text-[16px] text-ink select-all break-words break-all">
                  {revealed[n.id]}
                </code>
                <p className="font-serif italic text-[13px] text-ink-soft mt-1">
                  Hand this to {n.name} however feels right &mdash; printed, written,
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
            <NomineePhotoControl
              nominee={n}
              onUpdated={(updated) =>
                setItems((curr) =>
                  curr.map((x) => (x.id === updated.id ? updated : x)),
                )
              }
            />
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

function NomineePhotoControl({
  nominee,
  onUpdated,
}: {
  nominee: NomineeRow;
  onUpdated: (n: NomineeRow) => void;
}) {
  type S =
    | { kind: "idle" }
    | { kind: "scanning"; preview: string }
    | { kind: "saving"; preview: string }
    | { kind: "error"; message: string; preview?: string };
  const [state, setState] = useState<S>({ kind: "idle" });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const preview = URL.createObjectURL(f);
    setState({ kind: "scanning", preview });
    try {
      const { extractFaces } = await import("@/lib/face-client");
      const faces = await extractFaces(f);
      if (faces.length === 0) {
        setState({
          kind: "error",
          message: "No face detected. Try a clearer photo.",
          preview,
        });
        return;
      }
      const largest = [...faces].sort(
        (a, b) => b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h,
      )[0];
      setState({ kind: "saving", preview });
      const r = await fetch(`/api/nominees/${nominee.id}/photo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ face_embedding: largest.embedding }),
      });
      if (!r.ok) throw new Error(`status=${r.status}`);
      URL.revokeObjectURL(preview);
      setState({ kind: "idle" });
      onUpdated({ ...nominee, has_photo: true });
    } catch (err) {
      console.warn("[nominee photo] failed", err);
      setState({
        kind: "error",
        message: "Couldn't save that photo. Try again.",
        preview,
      });
    } finally {
      if (e.target) e.target.value = "";
    }
  }

  const busy = state.kind === "scanning" || state.kind === "saving";
  return (
    <div className="flex items-center gap-3 mt-1">
      {state.kind !== "idle" && state.preview && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.preview}
            alt={`${nominee.name} preview`}
            className="w-9 h-9 rounded-full object-cover border border-rule"
          />
          {busy && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full border-2 border-ink/15 border-t-ink animate-spin"
            />
          )}
        </div>
      )}
      <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-fade flex-1">
        {state.kind === "scanning"
          ? `Looking for ${nominee.name}'s face…`
          : state.kind === "saving"
            ? "Saving photo…"
            : state.kind === "error"
              ? state.message
              : nominee.has_photo
                ? "Reference photo on file"
                : "No reference photo for this person"}
      </p>
      <label className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted hover:text-ink underline cursor-pointer whitespace-nowrap inline-block py-2">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
          disabled={busy}
        />
        {nominee.has_photo ? "Update photo" : "Add photo"}
      </label>
    </div>
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
            has_photo: false,
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
        <label htmlFor="nominee-name" className="eyebrow text-[9px]">Name</label>
        <input
          id="nominee-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sam"
          maxLength={60}
          className="font-serif text-[16px] text-ink bg-transparent outline-none border-b border-rule focus:border-ink placeholder:text-ink-muted placeholder:italic"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="nominee-relation" className="eyebrow text-[9px]">Relation</label>
        <input
          id="nominee-relation"
          type="text"
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          placeholder="daughter"
          maxLength={40}
          className="font-sans text-[14px] text-ink bg-transparent outline-none border-b border-rule focus:border-ink placeholder:text-ink-muted"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="nominee-birthday" className="eyebrow text-[9px]">Birthday</label>
        <input
          id="nominee-birthday"
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          className="font-mono text-[12px] text-ink bg-transparent outline-none border-b border-rule focus:border-ink py-1"
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

function ArchiveKeySection() {
  const [state, setState] = useState<{
    has_passphrase: boolean;
    passphrase_set_at: string | null;
  } | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/me/passphrase", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) =>
        setState({
          has_passphrase: !!d.has_passphrase,
          passphrase_set_at: d.passphrase_set_at ?? null,
        }),
      )
      .catch(() => setState({ has_passphrase: false, passphrase_set_at: null }));
  }, []);

  async function regenerate() {
    setBusy(true);
    setConfirming(false);
    try {
      const r = await fetch("/api/me/passphrase", { method: "POST" });
      if (!r.ok) return;
      const d = (await r.json()) as { passphrase: string };
      setRevealed(d.passphrase);
      setState({
        has_passphrase: true,
        passphrase_set_at: new Date().toISOString(),
      });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="eyebrow">Your archive key</h2>
      <p className="p-body max-w-[520px]">
        A passphrase that opens your own archive after you sign out. Write
        it down somewhere safe &mdash; if you lose it, the only way back is to
        generate a new one from a device that&rsquo;s still signed in.
      </p>

      {state === null && (
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-fade max-w-[520px]">
          Checking…
        </p>
      )}

      {state?.has_passphrase && !revealed && (
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-fade max-w-[520px]">
          Key set
          {state.passphrase_set_at && <> · {formatDateLong(state.passphrase_set_at)}</>}
        </p>
      )}

      {revealed && (
        <div
          className="rounded-[10px] border p-3 flex flex-col gap-2 max-w-[520px]"
          style={{
            borderColor: "var(--color-wax)",
            background:
              "linear-gradient(180deg, rgba(255,243,210,0.4), var(--color-bg-raised))",
          }}
        >
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-wax">
            Write this down &mdash; shown only once
          </p>
          <code className="font-mono text-[16px] text-ink select-all break-words">
            {revealed}
          </code>
          <button
            type="button"
            onClick={copy}
            className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted hover:text-ink underline self-start inline-block py-2"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {state !== null && (
        <div className="flex items-center gap-3 max-w-[520px]">
          {confirming ? (
            <>
              <button
                type="button"
                className="btn-ghost text-ink-muted"
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: "var(--color-wax)" }}
                onClick={regenerate}
                disabled={busy}
              >
                {busy
                  ? "Generating…"
                  : state.has_passphrase
                    ? "Yes, replace it"
                    : "Generate"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-ghost self-start"
              onClick={() => setConfirming(true)}
              disabled={busy}
            >
              {state.has_passphrase ? "Generate a new key" : "Generate a key"}
            </button>
          )}
        </div>
      )}
      {confirming && state?.has_passphrase && (
        <p className="font-serif italic text-[13px] text-ink-soft max-w-[520px]">
          Your current key will stop working. Anyone who has it will no
          longer be able to open this archive.
        </p>
      )}
    </section>
  );
}



type ProviderInfo = {
  active: {
    profile: string;
    synthesis: string;
    vision: string;
    embedding: string;
  } | null;
  byok: {
    enabled: boolean;
    base_url: string;
    api_key_masked: string;
    synthesis_model: string;
    vision_model: string | null;
    embeddings: { mode: "local" } | { mode: "cloud"; model: string };
  } | null;
};

/** Settings → the model that reads and writes with you. Local by
 *  default; a creator can bring their own OpenAI-compatible key. The
 *  privacy statement spells out exactly what leaves the device when a
 *  key is active — that copy is a product commitment, not decoration. */
function ProviderSection() {
  const [info, setInfo] = useState<ProviderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [baseUrl, setBaseUrl] = useState("https://openrouter.ai/api/v1");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [cloudEmbeds, setCloudEmbeds] = useState(false);
  const [embedModel, setEmbedModel] = useState("text-embedding-3-small");

  const refresh = async () => {
    try {
      const r = await fetch("/api/settings/provider", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as ProviderInfo;
      setInfo(d);
      if (d.byok) {
        setBaseUrl(d.byok.base_url);
        setModel(d.byok.synthesis_model);
        setCloudEmbeds(d.byok.embeddings.mode === "cloud");
        if (d.byok.embeddings.mode === "cloud")
          setEmbedModel(d.byok.embeddings.model);
      }
    } catch {
      /* section stays in its quiet default */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh() is async; state settles after the fetch, not synchronously
    void refresh();
  }, []);

  const byokActive = info?.byok?.enabled ?? false;
  const host = (() => {
    try {
      return new URL(baseUrl).hostname;
    } catch {
      return "the provider";
    }
  })();

  async function save(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/settings/provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled,
          base_url: baseUrl.trim(),
          api_key: apiKey.trim() === "" ? "__keep__" : apiKey.trim(),
          synthesis_model: model.trim(),
          embeddings: cloudEmbeds
            ? { mode: "cloud", model: embedModel.trim() }
            : { mode: "local" },
        }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(
          d?.error?.message ??
            "The key check failed. Verify the endpoint, key and model name.",
        );
        return;
      }
      setEditing(false);
      setApiKey("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function forget() {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/settings/provider", { method: "DELETE" });
      setEditing(false);
      setApiKey("");
      setBaseUrl("https://openrouter.ai/api/v1");
      setModel("");
      setCloudEmbeds(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="eyebrow">Language model</h2>

      {loading && !editing && (
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-fade max-w-[520px]">
          Checking…
        </p>
      )}

      {!loading && !byokActive && !editing && (
        <>
          <p className="p-body max-w-[520px]">
            Heirloom runs on this device. Questions, answers, tags and photo
            captions are handled by Gemma&nbsp;4 through Ollama — nothing is
            sent anywhere.
          </p>
          <div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setEditing(true)}
            >
              Use a cloud model instead…
            </button>
          </div>
        </>
      )}

      {byokActive && !editing && info?.byok && (
        <div className="rounded-[12px] border border-rule p-4 bg-bg-raised flex flex-col gap-2 max-w-[520px]">
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
            Your key · {info.byok.api_key_masked}
          </p>
          <p className="font-serif text-[16px] text-ink leading-snug">
            {info.byok.synthesis_model}
          </p>
          <p className="text-[13px] leading-[1.6] text-ink-soft">
            via {(() => { try { return new URL(info.byok.base_url).hostname; } catch { return info.byok.base_url; } })()} ·
            embeddings {info.byok.embeddings.mode === "cloud"
              ? `in the cloud (${info.byok.embeddings.model})`
              : "stay on this device"}
          </p>
          <div className="flex gap-2 mt-1">
            <button type="button" className="btn-ghost" onClick={() => setEditing(true)}>
              Change
            </button>
            <button type="button" className="btn-ghost" onClick={forget} disabled={busy}>
              Forget key &amp; go local
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div className="rounded-[12px] border border-rule p-4 bg-bg-raised flex flex-col gap-3 max-w-[520px]">
          <div className="flex flex-col gap-1">
            <label htmlFor="provider-endpoint" className="eyebrow text-[9px]">Endpoint</label>
            <input
              id="provider-endpoint"
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
              className="font-mono text-[13px] text-ink bg-transparent outline-none border-b border-rule focus:border-ink py-1"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="provider-api-key" className="eyebrow text-[9px]">API key</label>
            <input
              id="provider-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={info?.byok ? `saved · ${info.byok.api_key_masked}` : "sk-…"}
              autoComplete="off"
              className="font-mono text-[13px] text-ink bg-transparent outline-none border-b border-rule focus:border-ink py-1"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="provider-model" className="eyebrow text-[9px]">Model</label>
            <input
              id="provider-model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="google/gemma-3-27b-it"
              className="font-mono text-[13px] text-ink bg-transparent outline-none border-b border-rule focus:border-ink py-1"
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={cloudEmbeds}
              onChange={(e) => setCloudEmbeds(e.target.checked)}
              className="mt-1"
            />
            <span className="text-[13px] leading-[1.6] text-ink-soft">
              Also run embeddings in the cloud. Off by default — the local
              embedding model is a small, fast download, and keeping it local
              means your whole archive text is never uploaded for indexing.
            </span>
          </label>
          {cloudEmbeds && (
            <div className="flex flex-col gap-1 pl-6">
              <label htmlFor="provider-embed-model" className="eyebrow text-[9px]">Embedding model</label>
              <input
                id="provider-embed-model"
                type="text"
                value={embedModel}
                onChange={(e) => setEmbedModel(e.target.value)}
                placeholder="text-embedding-3-small"
                className="font-mono text-[13px] text-ink bg-transparent outline-none border-b border-rule focus:border-ink py-1"
              />
              <p className="text-[12.5px] leading-[1.6] text-wax">
                Changing the embedding model requires re-indexing the archive
                (scripts/reindex-embeddings.ts) before search works again.
              </p>
            </div>
          )}

          <div
            className="rounded-[10px] border p-3"
            style={{
              borderColor: "rgba(125,42,26,0.25)",
              background: "rgba(125,42,26,0.05)",
            }}
          >
            <p className="text-[13px] leading-[1.65] text-ink-soft">
              With a key saved, this leaves your device and is sent to{" "}
              <strong className="text-ink">{host}</strong>: your questions and
              the archive passages they match, whenever you ask the archive
              something; each photo, at the moment it is captioned; and note
              text, when it is tagged.
              {cloudEmbeds
                ? " With cloud embeddings on, the full text of every memory is also sent once for indexing."
                : ` Recordings, transcription, your voice, and the archive index are never sent to ${host} — they stay on this device, travelling only inside the encrypted archive you choose to hand to someone.`}
            </p>
          </div>

          {error && (
            <p className="text-[13px] leading-[1.6] text-wax">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              className="btn"
              disabled={busy || !model.trim() || (!apiKey.trim() && !info?.byok)}
              onClick={() => save(true)}
            >
              {busy ? "Checking the key…" : "Check & use this model"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function VaultSection() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="eyebrow">Vault</h2>
        <p className="p-body max-w-[520px]">
          Export the entire archive as a single passphrase-encrypted
          <code className="font-mono text-[13px] text-ink mx-1">.hloom</code>
          file, or import a bundle someone shared with you. The bundle is
          self-contained &mdash; argon2id + ChaCha20-Poly1305 over a gzipped JSON
          snapshot of every row and blob.
        </p>
      </div>

      <ExportPanel />
      <ImportPanel />
    </section>
  );
}

function ExportPanel() {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function doExport() {
    if (passphrase.length < 6) {
      setMsg("Passphrase must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/vault/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setMsg(err?.error?.message ?? `Export failed (${r.status}).`);
        return;
      }
      const dispo = r.headers.get("content-disposition") ?? "";
      const m = dispo.match(/filename="([^"]+)"/);
      const filename =
        m?.[1] ?? `heirloom-${new Date().toISOString().slice(0, 10)}.hloom`;
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg(`Saved ${filename}. Keep the passphrase somewhere safe.`);
      setPassphrase("");
    } catch (e) {
      console.warn(e);
      setMsg("Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[12px] border border-rule p-5 bg-bg-raised max-w-[560px] flex flex-col gap-3">
      <h3 className="font-serif text-[17px] text-ink">Export</h3>
      <p className="p-meta">
        The passphrase encrypts the bundle. Whoever imports it later needs
        the same words.
      </p>
      <label htmlFor="export-passphrase" className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
        Passphrase
      </label>
      <input
        id="export-passphrase"
        type="password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        autoComplete="new-password"
        placeholder="six words is plenty"
        className="w-full font-serif text-[17px] text-ink bg-transparent border-b border-rule-strong outline-none focus:border-ink py-2"
      />
      <div className="flex items-center gap-3 mt-1">
        <button
          type="button"
          className="btn"
          onClick={doExport}
          disabled={busy || passphrase.length < 6}
        >
          {busy ? "Encrypting…" : "Export bundle"}
        </button>
        {msg && <p className="p-meta">{msg}</p>}
      </div>
    </div>
  );
}

function ImportPanel() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function doImport() {
    if (!file) {
      setMsg("Pick a .hloom file first.");
      return;
    }
    if (passphrase.length < 6) {
      setMsg("Enter the passphrase that was used at export time.");
      return;
    }
    setBusy(true);
    setMsg(null);
    setSummary(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("passphrase", passphrase);
      const r = await fetch("/api/vault/import", { method: "POST", body: fd });
      const data = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        counts?: Record<string, number>;
        error?: { message?: string };
      };
      if (!r.ok || !data.ok) {
        if (r.status === 401) setMsg("Wrong passphrase, or the bundle is corrupt.");
        else if (r.status === 413) setMsg("Bundle is too large (>200 MB).");
        else setMsg(data?.error?.message ?? `Import failed (${r.status}).`);
        return;
      }
      setSummary(data.counts ?? null);
      setMsg("Imported. Reload the home to see restored memories.");
      setFile(null);
      setPassphrase("");
      setConfirming(false);
      router.refresh();
    } catch (e) {
      console.warn(e);
      setMsg("Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[12px] border border-rule p-5 bg-bg-raised max-w-[560px] flex flex-col gap-3">
      <h3 className="font-serif text-[17px] text-ink">Import</h3>
      <p className="p-meta">
        Drop a <code className="font-mono">.hloom</code> bundle here.
        Existing captures in this vault are preserved &mdash; imported rows are
        merged in.
      </p>

      <label htmlFor="import-bundle" className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
        Bundle
      </label>
      <input
        id="import-bundle"
        type="file"
        accept=".hloom,application/json"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setMsg(null);
          setSummary(null);
        }}
        className="font-mono text-[12px] text-ink-soft file:font-mono file:text-[10px] file:tracking-[0.16em] file:uppercase file:bg-paper file:border file:border-rule file:rounded-md file:py-1.5 file:px-3 file:mr-3 file:cursor-pointer file:text-ink"
      />
      {file && (
        <p className="p-meta">
          Selected: <span className="text-ink">{file.name}</span> ·{" "}
          {(file.size / (1024 * 1024)).toFixed(1)} MB
        </p>
      )}

      <label htmlFor="import-passphrase" className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted mt-2">
        Passphrase
      </label>
      <input
        id="import-passphrase"
        type="password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        autoComplete="current-password"
        placeholder="words used at export time"
        className="w-full font-serif text-[17px] text-ink bg-transparent border-b border-rule-strong outline-none focus:border-ink py-2"
      />

      <div className="flex items-center gap-3 mt-1">
        {!confirming ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!file || passphrase.length < 6) {
                doImport();
                return;
              }
              setConfirming(true);
            }}
            disabled={busy || !file || passphrase.length < 6}
          >
            {busy ? "Decrypting…" : "Import bundle"}
          </button>
        ) : (
          <>
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
              Merge into this vault?
            </span>
            <button
              type="button"
              className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-fade hover:text-ink underline"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              onClick={doImport}
              disabled={busy}
            >
              {busy ? "Importing…" : "Yes, import"}
            </button>
          </>
        )}
        {msg && <p className="p-meta">{msg}</p>}
      </div>

      {summary && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-fade">
          {Object.entries(summary).map(([k, v]) => (
            <div key={k} className="contents">
              <dt>{k.replace(/_/g, " ")}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

type SelfieState =
  | { kind: "checking" }
  | { kind: "no-photo" }
  | { kind: "have-photo" }
  | { kind: "scanning"; preview: string }
  | { kind: "saving"; preview: string }
  | { kind: "error"; message: string; preview?: string };

function SelfieSection() {
  // Initial state is already "checking", so the mount effect only has to
  // resolve it — no synchronous setState needed.
  const [state, setState] = useState<SelfieState>({ kind: "checking" });
  const inputRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    try {
      const r = await fetch("/api/onboarding/self", { cache: "no-store" });
      const d = (await r.json()) as { has_embedding?: boolean };
      setState({ kind: d.has_embedding ? "have-photo" : "no-photo" });
    } catch {
      setState({ kind: "no-photo" });
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh() is async; state settles after the fetch, not synchronously
    void refresh();
  }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const preview = URL.createObjectURL(f);
    setState({ kind: "scanning", preview });

    try {
      const { extractFaces } = await import("@/lib/face-client");
      const faces = await extractFaces(f);
      if (faces.length === 0) {
        setState({
          kind: "error",
          message: "Couldn't find a face. Try a clearer photo of just you.",
          preview,
        });
        return;
      }
      // Pick the largest face if more than one
      const largest = [...faces].sort(
        (a, b) => b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h,
      )[0];
      setState({ kind: "saving", preview });
      const r = await fetch("/api/onboarding/self", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ face_embedding: largest.embedding }),
      });
      if (!r.ok) throw new Error(`save failed: ${r.status}`);
      URL.revokeObjectURL(preview);
      setState({ kind: "have-photo" });
    } catch (err) {
      console.warn("[selfie] update failed", err);
      setState({
        kind: "error",
        message: "Couldn't save that photo. Try again in a moment.",
        preview,
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="eyebrow">Your photo</h2>
      <p className="p-body max-w-[520px]">
        A reference photo of you lets Heirloom recognise your face in
        the photos you capture, so captions can name you instead of
        describing you generically.
      </p>

      <details className="rounded-[12px] border border-rule p-4 bg-bg-raised max-w-[560px]">
        <summary className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted cursor-pointer">
          What the archive does with this
        </summary>
        <p className="p-meta mt-2 max-w-[480px]">
          Face detection runs entirely on this device. We keep only a
          128-number fingerprint of your face on the archive, not the
          image itself. It is used only to recognise you in your own
          photos.
        </p>
      </details>

      <div className="flex items-center gap-4 max-w-[560px]">
        {(state.kind === "scanning" ||
          state.kind === "saving" ||
          (state.kind === "error" && state.preview)) && (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.preview!}
              alt="Selected photo"
              className="w-20 h-20 rounded-full object-cover border border-rule"
            />
            {(state.kind === "scanning" || state.kind === "saving") && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-full border-2 border-ink/15 border-t-ink animate-spin"
              />
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-ink-muted">
            {state.kind === "checking"
              ? "Checking…"
              : state.kind === "have-photo"
                ? "A reference photo is on file."
                : state.kind === "scanning"
                  ? "Looking for your face…"
                  : state.kind === "saving"
                    ? "Saving…"
                    : state.kind === "error"
                      ? state.message
                      : "No reference photo yet."}
          </p>
          {(state.kind === "no-photo" ||
            state.kind === "have-photo" ||
            state.kind === "error") && (
            <label className="btn cursor-pointer self-start">
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPick}
              />
              {state.kind === "have-photo" ? "Update photo" : "Add a photo"}
            </label>
          )}
        </div>
      </div>
    </section>
  );
}

type VoiceState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "unavailable"; reason: string }
  | { kind: "hosted" }
  | { kind: "no-profile" }
  | { kind: "have-profile"; duration_ms: number | null; created_at: string }
  | { kind: "recording"; durationMs: number }
  | { kind: "uploading" }
  | { kind: "error"; message: string };

function VoiceSection() {
  const [state, setState] = useState<VoiceState>({ kind: "checking" });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  const refresh = async () => {
    try {
      const r = await fetch("/api/voice/profile", { cache: "no-store" });
      const data = (await r.json()) as {
        profile: {
          id: string;
          duration_ms: number | null;
          created_at: string;
        } | null;
        tts_available: boolean;
        hosted?: boolean;
      };
      if (data.hosted) {
        setState({ kind: "hosted" });
        return;
      }
      if (!data.tts_available) {
        setState({
          kind: "unavailable",
          reason: "The voice engine isn't running on this device yet.",
        });
        return;
      }
      if (data.profile) {
        setState({
          kind: "have-profile",
          duration_ms: data.profile.duration_ms,
          created_at: data.profile.created_at,
        });
      } else {
        setState({ kind: "no-profile" });
      }
    } catch {
      setState({
        kind: "unavailable",
        reason: "Couldn't reach the voice engine.",
      });
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh() is async; state settles after the fetch, not synchronously
    void refresh();
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRef.current = mr;
      startedAtRef.current = Date.now();
      mr.start();
      setState({ kind: "recording", durationMs: 0 });

      const tick = () => {
        if (!mediaRef.current || mediaRef.current.state !== "recording") return;
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

  async function stopAndUpload() {
    const mr = mediaRef.current;
    if (!mr) return;
    setState({ kind: "uploading" });
    await new Promise<void>((resolve) => {
      mr.addEventListener("stop", () => resolve(), { once: true });
      mr.stop();
    });
    const blob = new Blob(chunksRef.current, { type: "audio/wav" });
    const wav = await webmBlobToWav(blob);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(wav));

    const fd = new FormData();
    fd.append("audio", wav, "reference.wav");
    fd.append("reference_text", VOICE_SCRIPT);
    const r = await fetch("/api/voice/clone", { method: "POST", body: fd });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      setState({
        kind: "error",
        message: err?.error?.message ?? `Upload failed (${r.status}).`,
      });
      return;
    }
    setState({ kind: "checking" });
    void refresh();
  }

  async function playSample() {
    try {
      const r = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: "Hello. Thank you for taking the time to listen to this archive.",
        }),
      });
      if (!r.ok) return;
      const blob = await r.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.play();
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="eyebrow">Your voice</h2>
      <p className="p-body max-w-[520px]">
        Heirloom can read your archive aloud in your own voice. Record the
        short passage below — once. Future captures, letters, and reflection
        sources can be played back in your voice on demand.
      </p>

      <details className="rounded-[12px] border border-rule p-4 bg-bg-raised max-w-[560px]">
        <summary className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted cursor-pointer">
          What the archive does with this
        </summary>
        <p className="p-meta mt-2 max-w-[480px]">
          Your recording stays on this device. We use it to clone the timbre
          of your voice so the archive can read your own words aloud later.
          The system <strong>never</strong> generates new sentences in your
          voice — only your actual writing, recordings, and the verbatim
          source text behind a Reflection answer.
        </p>
      </details>

      {state.kind === "checking" && (
        <p className="p-meta">Checking the voice engine…</p>
      )}

      {state.kind === "hosted" && (
        <div className="rounded-[12px] border border-rule-soft p-4 max-w-[560px] bg-paper">
          <p className="p-meta mb-2">
            Voice is made on your device.
          </p>
          <p className="p-meta max-w-[480px]">
            Recording, transcription, and cloning all run on your own device -
            never a cloud service. Your voice reaches the people you choose
            only inside the end-to-end-encrypted archive you hand them; it is
            never uploaded to a server in between. This hosted demo runs in the
            cloud, so it leaves voice out on purpose. Install the free macOS
            app to record in your own voice — the rest of the archive works
            exactly the same.
          </p>
        </div>
      )}

      {state.kind === "unavailable" && (
        <div className="rounded-[12px] border border-rule-soft p-4 max-w-[560px] bg-paper">
          <p className="p-meta mb-2">{state.reason}</p>
          <p className="p-meta max-w-[480px]">
            Voice cloning needs a one-time, on-device setup (~2 GB of ML
            dependencies). In the macOS app, run this once in Terminal:
          </p>
          <pre className="mt-2 px-3 py-2 rounded-md bg-bg-raised border border-rule font-mono text-[12px] overflow-x-auto">
            bash &quot;/Applications/Heirloom.app/Contents/Resources/tts/install-tts.sh&quot;
          </pre>
          <p className="p-meta mt-2">
            After it finishes, quit and relaunch Heirloom — the voice
            sidecar will auto-start.
          </p>
        </div>
      )}

      {state.kind === "have-profile" && (
        <div className="flex flex-col gap-3 max-w-[560px]">
          <p className="p-meta">
            A voice sample is on file ({Math.round((state.duration_ms ?? 0) / 1000)}
            s recorded).
          </p>
          <div className="flex gap-3 items-center">
            <button type="button" className="btn" onClick={playSample}>
              Hear a test
            </button>
            <button
              type="button"
              className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-fade hover:text-ink underline inline-block py-2"
              onClick={() => setState({ kind: "no-profile" })}
            >
              Re-record
            </button>
          </div>
        </div>
      )}

      {(state.kind === "no-profile" ||
        state.kind === "recording" ||
        state.kind === "uploading" ||
        state.kind === "error") && (
        <div className="flex flex-col gap-4 max-w-[560px]">
          <p className="p-meta">
            Somewhere quiet, at your natural pace &mdash; about twenty seconds.
            Let your voice do what it normally does; that&rsquo;s what makes it
            sound like you.
          </p>
          <blockquote className="font-serif italic text-[17px] leading-[1.5] text-ink-soft border-l-2 border-rule pl-4 text-wrap-pretty">
            “{VOICE_SCRIPT}”
          </blockquote>

          <div className="flex items-center gap-4">
            {state.kind === "recording" ? (
              <button type="button" className="btn" onClick={stopAndUpload}>
                Stop ({Math.floor(state.durationMs / 1000)}s)
              </button>
            ) : state.kind === "uploading" ? (
              <button type="button" className="btn" disabled>
                Cloning your voice…
              </button>
            ) : (
              <button type="button" className="btn" onClick={startRecording}>
                Start recording
              </button>
            )}

            {previewUrl && state.kind !== "recording" && (
              <audio src={previewUrl} controls className="h-8" />
            )}
          </div>

          {state.kind === "error" && (
            <p className="p-meta text-wax">{state.message}</p>
          )}
        </div>
      )}
    </section>
  );
}


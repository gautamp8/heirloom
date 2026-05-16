"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VOICE_SCRIPT, webmBlobToWav } from "@/lib/voice-record";

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

      <LifeEventsSection initial={initial.life_events} onChanged={() => router.refresh()} />

      <NomineesSection initial={initial.nominees} onChanged={() => router.refresh()} />

      <VoiceSection />

      <SelfieSection />

      <ArchiveKeySection />

      <NotificationsSection />

      <VaultSection />

      <SignOutSection />
    </div>
  );
}

function SignOutSection() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
      router.replace("/portal");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="flex flex-col gap-3">
      <h2 className="eyebrow">Session</h2>
      <p className="p-body max-w-[480px]">
        Sign out to hand this device to someone else - the next person
        opens the portal and signs in with their own passphrase.
      </p>
      <div>
        <button
          type="button"
          className="btn-ghost"
          onClick={signOut}
          disabled={busy}
        >
          {busy ? "Signing out…" : "Sign out of this device"}
        </button>
      </div>
    </section>
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
        // We don't get the id back from this minimal endpoint - onChanged
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
                  Write this down - shown only once
                </p>
                <code className="font-mono text-[16px] text-ink select-all">
                  {revealed[n.id]}
                </code>
                <p className="font-serif italic text-[13px] text-ink-soft mt-1">
                  Hand this to {n.name} however feels right - printed, written,
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
      <label className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted hover:text-ink underline cursor-pointer whitespace-nowrap">
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

type NotifStatus =
  | "unsupported"
  | "unknown"
  | "denied"
  | "off"
  | "on"
  | "native";

/** WKWebView in the desktop bundle doesn't speak Web Push. Heirloom is
 *  also always-on while the app is open, so the section just hides
 *  itself rather than nagging about "this browser doesn't support push". */
function isDesktopWebView(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "__TAURI_INTERNALS__" in window ||
    navigator.userAgent.includes("Heirloom/")
  );
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
        it down somewhere safe - if you lose it, the only way back is to
        generate a new one from a device that&rsquo;s still signed in.
      </p>

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
            Write this down — shown only once
          </p>
          <code className="font-mono text-[16px] text-ink select-all break-words">
            {revealed}
          </code>
          <button
            type="button"
            onClick={copy}
            className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted hover:text-ink underline self-start"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

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
                : state?.has_passphrase
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
            {state?.has_passphrase ? "Generate a new key" : "Generate a key"}
          </button>
        )}
      </div>
      {confirming && state?.has_passphrase && (
        <p className="font-serif italic text-[13px] text-ink-soft max-w-[520px]">
          Your current key will stop working. Anyone who has it will no
          longer be able to open this archive.
        </p>
      )}
    </section>
  );
}

function NotificationsSection() {
  const [status, setStatus] = useState<NotifStatus>("unknown");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isDesktopWebView()) {
        if (!cancelled) setStatus("native");
        return;
      }
      if (
        typeof window === "undefined" ||
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = (await reg?.pushManager.getSubscription()) ?? null;
      if (!cancelled) setStatus(sub ? "on" : "off");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // In the desktop bundle there's nothing meaningful to show. Render
  // nothing rather than a stub error message.
  if (status === "native") return null;

  /** Subscribe + POST to server, idempotent. Reuses an existing local
   *  subscription rather than failing if Safari still has one cached. */
  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const perm =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "off");
        setMsg(
          perm === "denied"
            ? "Notifications are blocked. Allow them in your browser settings."
            : null,
        );
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapid) {
        setMsg("Notifications aren't configured on this server.");
        return;
      }
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid).buffer as ArrayBuffer,
        }));
      const r = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!r.ok) throw new Error(`subscribe ${r.status}`);
      setStatus("on");
      setMsg("Notifications enabled.");
    } catch (e) {
      console.warn(e);
      setMsg(
        e instanceof Error && e.message.includes("subscribe")
          ? "Couldn't reach the server to register this device."
          : "Couldn't enable notifications on this device.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/notifications/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setStatus("off");
      setMsg("Notifications turned off.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/notifications/test", { method: "POST" });
      const data = await r.json().catch(() => ({}));
      if (data.delivered) {
        setMsg(`Sent (${data.delivered}).`);
        return;
      }
      // Server has no row for this device. The local PushSubscription
      // probably survived a server reset; re-register and retry once.
      setMsg("Re-registering this device…");
      await enable();
      const r2 = await fetch("/api/notifications/test", { method: "POST" });
      const d2 = await r2.json().catch(() => ({}));
      setMsg(
        d2.delivered
          ? `Sent (${d2.delivered}).`
          : "Couldn't reach this device. Turn off and on again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="eyebrow">Notifications</h2>
      <p className="p-body max-w-[480px]">
        Heirloom can let you know when a sealed letter unlocks and surface
        one memory each day. Notifications carry only a title - never the
        contents of a memory.
      </p>

      {status === "unsupported" && (
        <p className="p-meta">
          This browser doesn&rsquo;t support push notifications. On iOS,
          install Heirloom to your Home Screen first (Share &middot; Add to
          Home Screen) - Safari needs iOS 16.4 or newer.
        </p>
      )}

      {status === "denied" && (
        <p className="p-meta">
          Notifications are blocked for this site. Re-enable them in your
          browser&rsquo;s site settings, then refresh this page.
        </p>
      )}

      {(status === "off" || status === "unknown") && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn"
            onClick={enable}
            disabled={busy || status === "unknown"}
          >
            {busy ? "Working…" : "Turn on notifications"}
          </button>
        </div>
      )}

      {status === "on" && (
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-wax">
            On
          </span>
          <button
            type="button"
            className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted hover:text-ink underline"
            onClick={sendTest}
            disabled={busy}
          >
            Send a test
          </button>
          <button
            type="button"
            className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-fade hover:text-ink underline"
            onClick={disable}
            disabled={busy}
          >
            Turn off
          </button>
        </div>
      )}

      {msg && <p className="p-meta">{msg}</p>}
    </section>
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
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
          self-contained - argon2id + ChaCha20-Poly1305 over a gzipped JSON
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
      <label className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
        Passphrase
      </label>
      <input
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
        Existing captures in this vault are preserved - imported rows are
        merged in.
      </p>

      <label className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
        Bundle
      </label>
      <input
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

      <label className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted mt-2">
        Passphrase
      </label>
      <input
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
  const [state, setState] = useState<SelfieState>({ kind: "checking" });
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setState({ kind: "checking" });
    try {
      const r = await fetch("/api/onboarding/self", { cache: "no-store" });
      const d = (await r.json()) as { has_embedding?: boolean };
      setState({ kind: d.has_embedding ? "have-photo" : "no-photo" });
    } catch {
      setState({ kind: "no-photo" });
    }
  }

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

  useEffect(() => {
    refresh();
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setState({ kind: "checking" });
    try {
      const r = await fetch("/api/voice/profile", { cache: "no-store" });
      const data = (await r.json()) as {
        profile: {
          id: string;
          duration_ms: number | null;
          created_at: string;
        } | null;
        tts_available: boolean;
      };
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
  }

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
    refresh();
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
        short passage below - once. Future captures, letters, and reflection
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
          voice - only your actual writing, recordings, and the verbatim
          source text behind a Reflection answer.
        </p>
      </details>

      {state.kind === "checking" && (
        <p className="p-meta">Checking the voice engine…</p>
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
            After it finishes, quit and relaunch Heirloom - the voice
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
              className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-fade hover:text-ink underline"
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
              // eslint-disable-next-line jsx-a11y/media-has-caption
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


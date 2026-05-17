"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
export function isDesktopWebView(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "__TAURI_INTERNALS__" in window ||
    navigator.userAgent.includes("Heirloom/")
  );
}

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function NotificationsSection() {
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

  if (status === "native") return null;

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

export function SignOutSection({
  copy,
}: {
  copy?: string;
}) {
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
        {copy ??
          "Sign out to hand this device to someone else - the next person opens the portal and signs in with their own passphrase."}
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

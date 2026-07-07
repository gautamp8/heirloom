"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "heirloom-demo-banner-dismissed";
const DISMISS_EVENT = "heirloom-demo-banner-dismissed";

function subscribe(onChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => window.removeEventListener(DISMISS_EVENT, onChange);
}

function readDismissed() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Sticky banner shown on the public Sagan demo deployment so visitors
 * know the latencies are constrained and the host is not their own.
 * Rendered only when `NEXT_PUBLIC_HEIRLOOM_DEMO_NOTICE` is set; users
 * can dismiss it per browser session.
 */
export function DemoBanner({ enabled }: { enabled: boolean }) {
  // Server snapshot says "hidden" so the banner never flashes during
  // hydration; the client snapshot reads the real per-session dismissal.
  const hidden = useSyncExternalStore(subscribe, readDismissed, () => true);

  if (!enabled || hidden) return null;

  return (
    <div
      role="region"
      aria-label="Demo notice"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        background: "rgba(125, 42, 26, 0.97)",
        color: "rgba(250,247,240,0.97)",
        borderBottom: "1px solid rgba(31,27,20,0.18)",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "10px 18px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          lineHeight: 1.45,
        }}
      >
        <span
          aria-hidden
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(250,247,240,0.85)",
            paddingRight: 12,
            borderRight: "1px solid rgba(250,247,240,0.28)",
          }}
        >
          Public demo
        </span>
        <span style={{ flex: 1 }}>
          This is the Sagan demo, hosted on a small Azure VM. Answers can be
          slow, and anything you submit here is stored on the VM — not on
          your own device. For real use, install Heirloom on your own
          device.
        </span>
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem(STORAGE_KEY, "1");
            } catch {
              /* ignore */
            }
            window.dispatchEvent(new Event(DISMISS_EVENT));
          }}
          aria-label="Dismiss demo notice"
          style={{
            background: "transparent",
            border: "1px solid rgba(250,247,240,0.45)",
            color: "rgba(250,247,240,0.95)",
            padding: "4px 10px",
            borderRadius: 999,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

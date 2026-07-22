"use client";

export const DEMO_BANNER_STORAGE_KEY = "heirloom-demo-banner-dismissed";
export const DEMO_BANNER_DISMISSED_ATTR = "data-demo-banner-dismissed";

/**
 * Sticky banner shown on the public Sagan demo deployment so visitors
 * know the host is not their own. Rendered only when
 * `NEXT_PUBLIC_HEIRLOOM_DEMO_NOTICE` is set; dismissible per session.
 *
 * It renders on the SERVER so first paint already includes it. An
 * earlier version kept it hidden until hydration, which inserted a
 * ~180px block at the top of the page after load and cost 0.30
 * cumulative layout shift - the only thing Lighthouse failed the demo
 * on. Per-session dismissal is applied instead by a pre-paint script in
 * the layout that stamps `data-demo-banner-dismissed` on <html>, with a
 * globals.css rule hiding the banner on that attribute - so a returning
 * visitor gets neither the flash the old approach avoided nor the shift
 * it caused.
 */
export function DemoBanner({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;

  return (
    <div
      data-demo-banner=""
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
          This is the Sagan demo — a public archive on a small cloud server
          running Azure OpenAI, so you can try Heirloom without installing
          anything. The real product runs fully offline on your own device and
          keeps nothing on a server; here, treat it as public — anything you
          submit is visible to others and wiped nightly.
        </span>
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem(DEMO_BANNER_STORAGE_KEY, "1");
            } catch {
              /* ignore */
            }
            document.documentElement.setAttribute(
              DEMO_BANNER_DISMISSED_ATTR,
              "1",
            );
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

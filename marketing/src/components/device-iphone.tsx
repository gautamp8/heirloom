// iPhone (iOS 26) frame. Port of design-system/prototypes/ios-frame.jsx.
// Hand-crafted: dynamic island, 48px outer radius, home indicator.
// The status bar is dark by default because Heirloom screens are paper.

import type { ReactNode } from "react";

type Props = {
  width?: number;
  height?: number;
  time?: string;
  children: ReactNode;
  dark?: boolean;
  className?: string;
};

export function DeviceiPhone({
  width = 360,
  height = 760,
  time = "9:41",
  children,
  dark = false,
  className,
}: Props) {
  const c = dark ? "#fff" : "#000";
  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        width,
        height,
        maxWidth: "100%",
        borderRadius: 48,
        overflow: "hidden",
        position: "relative",
        background: dark ? "#000" : "var(--color-bg-raised)",
        boxShadow:
          "0 36px 80px -24px rgba(31,27,20,0.34), 0 0 0 1px rgba(31,27,20,0.10), inset 0 0 0 1.5px rgba(255,255,255,0.4)",
      }}
    >
      {/* outer bezel ring */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 48,
          boxShadow: "inset 0 0 0 6px #0a0907",
          pointerEvents: "none",
          zIndex: 40,
        }}
      />

      {/* dynamic island */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          width: 108,
          height: 30,
          borderRadius: 24,
          background: "#000",
          zIndex: 50,
        }}
      />

      {/* status bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 50,
          padding: "16px 28px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 30,
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontFamily: "-apple-system, SF Pro, system-ui",
            fontWeight: 600,
            fontSize: 14,
            color: c,
            letterSpacing: 0.2,
          }}
        >
          {time}
        </span>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <svg width="16" height="10" viewBox="0 0 19 12">
            <rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill={c} />
            <rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill={c} />
            <rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill={c} />
            <rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill={c} />
          </svg>
          <svg width="22" height="10" viewBox="0 0 27 13">
            <rect
              x="0.5"
              y="0.5"
              width="23"
              height="12"
              rx="3.5"
              stroke={c}
              strokeOpacity="0.35"
              fill="none"
            />
            <rect x="2" y="2" width="18" height="9" rx="2" fill={c} />
            <path
              d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z"
              fill={c}
              fillOpacity="0.4"
            />
          </svg>
        </div>
      </div>

      {/* viewport */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          paddingTop: 50,
          paddingBottom: 28,
          overflow: "hidden",
          background: dark ? "#000" : "var(--color-paper)",
        }}
      >
        {children}
      </div>

      {/* home indicator */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: 9,
          left: "50%",
          transform: "translateX(-50%)",
          width: 124,
          height: 4,
          borderRadius: 100,
          background: dark ? "rgba(255,255,255,0.85)" : "rgba(31,27,20,0.40)",
          zIndex: 60,
        }}
      />
    </div>
  );
}

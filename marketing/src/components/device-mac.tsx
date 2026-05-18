// A macOS window frame. Drawn in pure SVG/CSS - no external assets.
// Traffic-light buttons, clean header, inner viewport tinted as the
// Heirloom canvas. Intentionally no URL bar - the frame is just a
// visual container, not a faux browser.

import type { ReactNode } from "react";

type Props = {
  width?: number;
  height?: number;
  children: ReactNode;
  className?: string;
};

export function DeviceMac({
  width = 1040,
  height = 660,
  children,
  className,
}: Props) {
  return (
    <div
      className={className}
      style={{
        width,
        maxWidth: "100%",
        borderRadius: 16,
        background: "var(--color-bg-raised)",
        boxShadow:
          "0 2px 0 rgba(0,0,0,0.05), 0 28px 64px -22px rgba(31,27,20,0.30), 0 0 0 1px rgba(31,27,20,0.08)",
        overflow: "hidden",
      }}
    >
      {/* title bar */}
      <div
        style={{
          height: 32,
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          background: "linear-gradient(180deg, #FBF7EE 0%, #F2ECDD 100%)",
          borderBottom: "1px solid var(--color-rule-soft)",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <span style={dot("#FF5F57", "#E0443E")} />
          <span style={dot("#FEBC2E", "#DEA123")} />
          <span style={dot("#28C840", "#1AAB29")} />
        </div>
      </div>

      <div
        style={{
          height,
          background: "var(--color-paper)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function dot(top: string, bot: string): React.CSSProperties {
  return {
    width: 12,
    height: 12,
    borderRadius: 999,
    background: `linear-gradient(180deg, ${top} 0%, ${bot} 100%)`,
    border: "1px solid rgba(0,0,0,0.08)",
    display: "inline-block",
  };
}

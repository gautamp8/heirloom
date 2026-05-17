/** Heirloom design tokens, mirrored from the product's globals.css. */

export const colors = {
  paper: "#faf7f0",
  paper2: "#f2ebdb",
  paper3: "#e8dfc8",
  vellum: "#d8cba8",
  bgRaised: "#fffdf7",
  ink: "#1f1b14",
  inkSoft: "#4a4338",
  inkMuted: "#8c8472",
  inkFade: "#9c9075",
  sepia: "#5c3a21",
  wax: "#7d2a1a",
  wax2: "#5c1f12",
  waxSoft: "#a23f2a",
  candle: "#c9892a",
  moss: "#5f6b43",
  rule: "rgba(31, 27, 20, 0.10)",
  ruleStrong: "rgba(31, 27, 20, 0.22)",
};

/** Cubic ease-out fade-in with a small upward drift, returned as
 *  inline style props ready to spread onto an element. */
export function fadeUp(opts: {
  frame: number;
  from: number;
  dur?: number;
  translate?: number;
}): { opacity: number; transform: string } {
  const dur = opts.dur ?? 24;
  const t = Math.max(0, Math.min(1, (opts.frame - opts.from) / dur));
  const eased = 1 - Math.pow(1 - t, 3);
  const drift = opts.translate ?? 12;
  return {
    opacity: eased,
    transform: `translateY(${(1 - eased) * drift}px)`,
  };
}

export const paperPageStyle: React.CSSProperties = {
  background: `linear-gradient(180deg, ${colors.paper} 0%, ${colors.paper2} 100%)`,
  width: "100%",
  height: "100%",
};

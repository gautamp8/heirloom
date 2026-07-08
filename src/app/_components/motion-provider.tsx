"use client";

import { MotionConfig } from "framer-motion";

/**
 * App-wide reduced-motion honouring. The global CSS
 * `@media (prefers-reduced-motion)` reset only neutralises CSS
 * transitions/animations — it does nothing to Framer Motion's JS/WAAPI
 * driven transforms (the envelope choreography, card entrances, error
 * shakes, infinite skeleton pulses). `reducedMotion="user"` makes every
 * `motion.*` in the tree respect the OS setting: transform/layout
 * animations collapse to instant while opacity fades are kept.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

// The home-page reel. Six beats over 16 seconds, looped, in a Mac frame.
// CSS-keyframe based - no JS animation loop, respects reduced-motion via
// the global @media query in globals.css.
//
// Beats:
//   0.0  – 2.4s   portal
//   2.4  – 5.0s   creator home (greeting + prompt)
//   5.0  – 7.4s   capture (typing)
//   7.4  – 10.2s  reflect (mid-stream, citations pulse)
//   10.2 – 13.0s  reflect with source drawer slid up
//   13.0 – 16.0s  nominee home (the loop closes - someone receives it)

import { DeviceMac } from "./device-mac";
import { MockupPortal } from "@/mockups/portal";
import { MockupHome } from "@/mockups/home";
import { MockupCapture } from "@/mockups/capture";
import { MockupReflect } from "@/mockups/reflect";
import { MockupNominee } from "@/mockups/nominee";

export function Reel() {
  return (
    <>
      <style>{REEL_CSS}</style>
      <DeviceMac width={1040} height={540}>
        <div className="reel">
          <div className="reel-frame reel-1">
            <MockupPortal />
          </div>
          <div className="reel-frame reel-2">
            <MockupHome />
          </div>
          <div className="reel-frame reel-3">
            <MockupCapture typed="Look again at that dot. That's here. That's home." />
          </div>
          <div className="reel-frame reel-4">
            <MockupReflect desktop showDrawer={false} />
          </div>
          <div className="reel-frame reel-5">
            <MockupReflect desktop showDrawer />
          </div>
          <div className="reel-frame reel-6">
            <MockupNominee />
          </div>
        </div>
      </DeviceMac>
    </>
  );
}

// The frames stack absolutely; opacity is the only thing animated.
// Total cycle = 16s, so each frame holds roughly 2.5-3s.
const REEL_CSS = `
  .reel { position: absolute; inset: 0; }
  .reel-frame {
    position: absolute; inset: 0;
    opacity: 0;
    animation-duration: 16s;
    animation-timing-function: var(--ease-paper);
    animation-iteration-count: infinite;
  }
  .reel-1 { animation-name: reel-portal; }
  .reel-2 { animation-name: reel-home; }
  .reel-3 { animation-name: reel-capture; }
  .reel-4 { animation-name: reel-reflect; }
  .reel-5 { animation-name: reel-drawer; }
  .reel-6 { animation-name: reel-nominee; }

  /* Cycle markers (in %):
     0    portal in
     14   portal out / home in
     30   home out / capture in
     45   capture out / reflect in
     62   reflect out / drawer in
     78   drawer out / nominee in
     96   nominee out / portal in
   */
  @keyframes reel-portal {
    0%, 11%    { opacity: 1; }
    16%, 95%   { opacity: 0; }
    100%       { opacity: 1; }
  }
  @keyframes reel-home {
    0%, 13%    { opacity: 0; }
    18%, 28%   { opacity: 1; }
    33%, 100%  { opacity: 0; }
  }
  @keyframes reel-capture {
    0%, 28%    { opacity: 0; }
    33%, 43%   { opacity: 1; }
    48%, 100%  { opacity: 0; }
  }
  @keyframes reel-reflect {
    0%, 43%    { opacity: 0; }
    48%, 59%   { opacity: 1; }
    64%, 100%  { opacity: 0; }
  }
  @keyframes reel-drawer {
    0%, 59%    { opacity: 0; }
    64%, 75%   { opacity: 1; }
    80%, 100%  { opacity: 0; }
  }
  @keyframes reel-nominee {
    0%, 75%    { opacity: 0; }
    80%, 94%   { opacity: 1; }
    98%, 100%  { opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .reel-frame { animation: none !important; opacity: 0; }
    .reel-1     { opacity: 1; }
  }
`;

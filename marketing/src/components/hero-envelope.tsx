/**
 * The marketing hero's opening ceremony — a wax-sealed envelope whose flap
 * lifts (the seal riding with it) and letter rises out, on load. It's the
 * same choreography as the app's welcome envelope (src/app/welcome/
 * envelope.tsx), ported to pure CSS keyframes so the marketing bundle
 * carries no animation runtime. Easings match the app exactly
 * (--ease-fold / --ease-paper). Honors prefers-reduced-motion: the letter
 * simply rests open, no motion.
 *
 * Server component — it's all declarative CSS; no client JS ships.
 */
export function HeroEnvelope() {
  return (
    <div className="hero-env" aria-hidden="true">
      <style>{ENV_CSS}</style>

      {/* Letter — rises out of the envelope once the flap is open. */}
      <div className="he-letter">
        <div className="he-letter-lines">
          <span style={{ width: "72%" }} />
          <span style={{ width: "88%" }} />
          <span style={{ width: "64%" }} />
          <span style={{ width: "80%" }} />
          <span style={{ width: "58%" }} />
        </div>
        <p className="he-letter-note">
          Look again at that dot. That&rsquo;s here. That&rsquo;s home.
          That&rsquo;s us.
        </p>
      </div>

      {/* Envelope back (seen behind the opened flap). */}
      <div className="he-back" />

      {/* Envelope front body with the debossed fold lines. */}
      <div className="he-front">
        <svg
          viewBox="0 0 300 200"
          preserveAspectRatio="none"
          className="he-folds"
        >
          <line x1="0" y1="0" x2="150" y2="99" />
          <line x1="300" y1="0" x2="150" y2="99" />
          <line x1="0" y1="200" x2="150" y2="154" />
          <line x1="300" y1="200" x2="150" y2="154" />
        </svg>
      </div>

      {/* Flap (triangular) — rotates up on --ease-fold. */}
      <div className="he-flap" />

      {/* Seal rides the flap: same pivot, no clip, so it travels up with
          the flap and reads as "the wax has just released." */}
      <div className="he-seal-rider">
        <div className="he-seal" />
      </div>
    </div>
  );
}

const ENV_CSS = `
.hero-env {
  position: relative;
  width: 300px;
  /* Envelope body runs 130→330px and the letter rises to ~6px, so the
     box must be tall enough to hold both or the pills below collide. */
  height: 340px;
  margin: 0 auto;
  perspective: 1600px;
  transform-style: preserve-3d;
}
@media (max-width: 480px) {
  /* Scale the whole ceremony down on small screens. */
  .hero-env { transform: scale(0.82); height: 300px; margin-top: -10px; }
}
.hero-env * { box-sizing: border-box; }

/* ---- letter ---------------------------------------------------------- */
.he-letter {
  position: absolute;
  left: 18px;
  top: 156px;
  width: 264px;
  height: 168px;
  background: var(--color-bg-raised);
  border: 1px solid var(--color-rule-soft);
  border-radius: 2px;
  box-shadow: 0 1px 0 rgba(0,0,0,0.04);
  z-index: 1;
  transform-origin: center bottom;
  transform: translateY(0) scale(1);
  animation: he-letter-rise var(--duration-cinema) var(--ease-paper) 1.9s both;
}
.he-letter-lines {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 22px 22px 0;
  opacity: 0;
  animation: he-fade var(--duration-calm) var(--ease-paper) 3s both;
}
.he-letter-lines span {
  height: 6px;
  border-radius: 999px;
  background: var(--color-rule);
  opacity: 0.55;
}
.he-letter-note {
  margin: 14px 22px 0;
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-ink-soft);
  opacity: 0;
  text-wrap: pretty;
  animation: he-fade var(--duration-calm) var(--ease-paper) 3.25s both;
}

/* ---- envelope body --------------------------------------------------- */
.he-back {
  position: absolute;
  top: 130px; left: 0;
  width: 300px; height: 200px;
  background: var(--color-paper-3);
  border-radius: 8px;
  z-index: 0;
}
.he-front {
  position: absolute;
  top: 130px; left: 0;
  width: 300px; height: 200px;
  background: var(--color-paper-2);
  border-radius: 8px;
  box-shadow: var(--shadow-paper-2);
  z-index: 2;
  overflow: hidden;
}
.he-folds { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.he-folds line { stroke: rgba(31,27,20,0.07); stroke-width: 1; }
.he-folds line:nth-child(n+3) { stroke: rgba(31,27,20,0.05); }

/* ---- flap + seal ----------------------------------------------------- */
.he-flap {
  position: absolute;
  top: 130px; left: 0;
  width: 300px; height: 116px;
  background: var(--color-paper-3);
  clip-path: polygon(0% 0%, 100% 0%, 50% 82.7%);
  transform-origin: top center;
  transform-style: preserve-3d;
  box-shadow: inset 0 0 0 1px rgba(31,27,20,0.05), 0 2px 4px -2px rgba(0,0,0,0.08);
  z-index: 3;
  transform: rotateX(0deg);
  animation: he-flap-open var(--duration-cinema) var(--ease-fold) 0.9s both;
}
.he-seal-rider {
  position: absolute;
  top: 130px; left: 0;
  width: 300px; height: 116px;
  transform-origin: top center;
  transform-style: preserve-3d;
  z-index: 4;
  pointer-events: none;
  transform: rotateX(0deg);
  animation: he-flap-open var(--duration-cinema) var(--ease-fold) 0.9s both;
}
.he-seal {
  position: absolute;
  left: 102px;
  top: 48px;
  width: 96px; height: 96px;
  background: url(/seal-2x.png) center / contain no-repeat;
  filter: drop-shadow(0 4px 6px rgba(0,0,0,0.28));
  transform-origin: center;
  animation: he-seal-press 0.9s var(--ease-paper) both;
}

/* ---- keyframes ------------------------------------------------------- */
@keyframes he-flap-open {
  0%   { transform: rotateX(0deg); opacity: 1; }
  55%  { transform: rotateX(-125deg); opacity: 1; }
  70%  { opacity: 1; }
  100% { transform: rotateX(-180deg); opacity: 0; }
}
@keyframes he-letter-rise {
  0%   { transform: translateY(0) scale(1); }
  100% { transform: translateY(-150px) scale(1.02); }
}
@keyframes he-seal-press {
  0%   { transform: scale(0.6); opacity: 0; }
  60%  { transform: scale(1.06); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes he-fade { to { opacity: 1; } }

/* Reduced motion: no choreography — the letter simply rests open, seal
   pressed, everything at its end state, instantly. */
@media (prefers-reduced-motion: reduce) {
  .hero-env * { animation: none !important; }
  .he-flap, .he-seal-rider { transform: rotateX(-180deg); opacity: 0; }
  .he-letter { transform: translateY(-150px) scale(1.02); }
  .he-letter-lines, .he-letter-note { opacity: 1; }
  .he-seal { transform: scale(1); opacity: 1; }
}
`;

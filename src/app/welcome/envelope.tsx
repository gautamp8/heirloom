"use client";

import { motion } from "framer-motion";
import { EASE_FOLD, EASE_PAPER, type Stage } from "./welcome-flow";

/** Envelope + intact wax seal + folded letter. The seal stays attached to
 *  the flap — they share the same rotation pivot, so when the flap lifts
 *  the seal rides with it. */
export function Envelope({
  stage,
  letter,
}: {
  stage: Stage;
  letter: { from_name: string; to_name: string; body: string } | null;
}) {
  const flapOpen =
    stage === "opening" || stage === "emerging" || stage === "unfolding";
  const letterUp = stage === "emerging" || stage === "unfolding";
  const letterUnfolded = stage === "unfolding";

  const W = 300;
  const H = 200;
  const FLAP_H = 116;
  const TIP_Y_PCT = (FLAP_H - 20) / FLAP_H * 100;
  // Top offset of the envelope itself within the outer wrapper
  const ENV_TOP = 130;

  // Animation values for the flap and the seal-rider — kept in sync.
  //  - 0°    closed (seal centred, flap V-shape over body)
  //  - -125° opening peak — flap is lifted up-and-back, seal is in view
  //          and reads as "wax has just released"
  //  - -180° fully behind the envelope — out of the way once the letter
  //          starts to rise so it doesn't visually crash into the letter
  const flapRotate =
    stage === "envelope" ? 0 : stage === "opening" ? -125 : -180;
  const flapOpacity = stage === "envelope" || stage === "opening" ? 1 : 0;

  return (
    <div
      className="relative"
      style={{
        width: W,
        height: H + 130,
        marginTop: -130,
        perspective: 1600,
        transformStyle: "preserve-3d",
      }}
    >
      {/* === LAYER 0: LETTER — slides up out of the envelope once flap is open === */}
      <motion.div
        className="absolute"
        style={{
          left: 18,
          width: W - 36,
          top: ENV_TOP + 26,
          height: 168,
          background: "var(--color-bg-raised)",
          borderRadius: 2,
          border: "1px solid var(--color-rule-soft)",
          boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
          zIndex: 1,
          transformOrigin: "center bottom",
        }}
        initial={false}
        animate={{
          y: letterUp ? -210 : 0,
          scale: letterUnfolded ? 1.02 : 1,
        }}
        transition={{
          y: { duration: 1.1, ease: EASE_PAPER },
          scale: { duration: 0.6, ease: EASE_PAPER, delay: 0.7 },
        }}
      >
        <motion.div
          className="px-5 py-5 flex flex-col gap-[7px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: letterUnfolded ? 1 : 0 }}
          transition={{
            duration: 0.6,
            ease: EASE_PAPER,
            delay: letterUnfolded ? 0.3 : 0,
          }}
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="h-[6px] rounded-full"
              style={{
                background: "var(--color-rule)",
                width: `${82 - (i % 3) * 14}%`,
                opacity: 0.55,
              }}
            />
          ))}
          {letter && (
            <p
              className="mt-3 font-serif italic text-[11px] text-ink-soft text-wrap-pretty"
              style={{ opacity: 0.92 }}
            >
              {letter.body.split(/\s*\n\s*/).join(" ").slice(0, 90)}…
            </p>
          )}
        </motion.div>
      </motion.div>

      {/* === LAYER 1: ENVELOPE BACK (visible behind opened flap) === */}
      <div
        className="absolute"
        style={{
          top: ENV_TOP,
          left: 0,
          width: W,
          height: H,
          background: "var(--color-paper-3)",
          borderRadius: 8,
          zIndex: 0,
        }}
      />

      {/* === LAYER 2: ENVELOPE FRONT BODY === */}
      <div
        className="absolute"
        style={{
          top: ENV_TOP,
          left: 0,
          width: W,
          height: H,
          background: "var(--color-paper-2)",
          borderRadius: 8,
          boxShadow: "var(--shadow-paper-2)",
          zIndex: 2,
          overflow: "hidden",
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <line x1={0} y1={0} x2={W / 2} y2={FLAP_H * 0.85}
                stroke="rgba(31,27,20,0.07)" strokeWidth="1" />
          <line x1={W} y1={0} x2={W / 2} y2={FLAP_H * 0.85}
                stroke="rgba(31,27,20,0.07)" strokeWidth="1" />
          <line x1={0} y1={H} x2={W / 2} y2={H - FLAP_H * 0.4}
                stroke="rgba(31,27,20,0.05)" strokeWidth="1" />
          <line x1={W} y1={H} x2={W / 2} y2={H - FLAP_H * 0.4}
                stroke="rgba(31,27,20,0.05)" strokeWidth="1" />
        </svg>
      </div>

      {/* === LAYER 3: FLAP (triangular, clipped) === */}
      <motion.div
        className="absolute"
        style={{
          top: ENV_TOP,
          left: 0,
          width: W,
          height: FLAP_H,
          background: "var(--color-paper-3)",
          clipPath: `polygon(0% 0%, 100% 0%, 50% ${TIP_Y_PCT}%)`,
          transformOrigin: "top center",
          transformStyle: "preserve-3d",
          boxShadow:
            "inset 0 0 0 1px rgba(31,27,20,0.05), 0 2px 4px -2px rgba(0,0,0,0.08)",
          zIndex: 3,
        }}
        initial={false}
        animate={{ rotateX: flapRotate, opacity: flapOpacity }}
        transition={{
          rotateX: { duration: 1.1, ease: EASE_FOLD },
          opacity: { duration: 0.4, ease: EASE_PAPER, delay: 0.6 },
        }}
      />

      {/* === LAYER 4: SEAL-RIDER — sibling of flap, NO clip, shares the
                                     flap's rotation pivot (top center of
                                     the envelope flap region) so the seal
                                     visibly travels with the flap. === */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          top: ENV_TOP,
          left: 0,
          width: W,
          height: FLAP_H,
          transformOrigin: "top center",
          transformStyle: "preserve-3d",
          zIndex: 4,
        }}
        initial={false}
        animate={{ rotateX: flapRotate, opacity: flapOpacity }}
        transition={{
          rotateX: { duration: 1.1, ease: EASE_FOLD },
          opacity: { duration: 0.4, ease: EASE_PAPER, delay: 0.6 },
        }}
      >
        {/* Seal positioned at the apex of the flap — center of seal sits
            on the triangle tip so when the flap is closed the seal looks
            "pressed" at the meeting point of flap and envelope body. */}
        <div
          style={{
            position: "absolute",
            left: W / 2 - 48,
            top: FLAP_H * (TIP_Y_PCT / 100) - 48,
            width: 96,
            height: 96,
            backgroundImage: "url(/seal-2x.png)",
            backgroundSize: "contain",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.28))",
          }}
        />
      </motion.div>
    </div>
  );
}

// A phone-screen view of a sealed letter that just unlocked. A
// notification banner at the top, the envelope in the middle, the
// occasion line below it. Designed so the Hand-off pillar looks
// consistent with the Capture + Reflect pillars (all three in a
// phone frame).

import { MockupLetter } from "./letter";

export function MockupSealedLetterPhone() {
  return (
    <div
      className="stage"
      style={{
        height: "100%",
        padding: "26px 22px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      {/* Notification card */}
      <div
        style={{
          background: "var(--color-bg-raised)",
          border: "1px solid var(--color-rule-soft)",
          borderRadius: 14,
          padding: "12px 14px",
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 12,
          alignItems: "center",
          boxShadow: "var(--shadow-paper-1)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static asset in a self-contained mockup */}
        <img
          src="/seal-2x.png"
          alt=""
          aria-hidden
          width={34}
          height={34}
          style={{
            width: 34,
            height: 34,
            objectFit: "contain",
            filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.22))",
          }}
        />
        <div style={{ minWidth: 0 }}>
          <p
            className="p-meta"
            style={{
              color: "var(--color-wax)",
              fontSize: 9.5,
              letterSpacing: "0.18em",
              marginBottom: 2,
            }}
          >
            Heirloom · now
          </p>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              color: "var(--color-ink)",
              fontWeight: 500,
              lineHeight: 1.3,
            }}
          >
            A letter has arrived for you.
          </p>
        </div>
      </div>

      {/* Eyebrow */}
      <p
        className="p-meta"
        style={{ marginTop: 4, color: "var(--color-ink-soft)" }}
      >
        Hand off
      </p>

      {/* Envelope */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
        <MockupLetter width={260} />
      </div>

      {/* Occasion */}
      <p
        className="voice"
        style={{
          textAlign: "center",
          fontSize: 14.5,
          color: "var(--color-ink-soft)",
          marginTop: 2,
          fontStyle: "italic",
        }}
      >
        For your birthday.
      </p>
    </div>
  );
}

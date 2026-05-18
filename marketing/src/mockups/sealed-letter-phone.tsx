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
        <span
          aria-hidden
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "var(--color-wax)",
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 16,
            color: "rgba(250,247,240,0.95)",
            fontWeight: 400,
          }}
        >
          H
        </span>
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

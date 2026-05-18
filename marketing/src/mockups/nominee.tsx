// Nominee home: daily memory hero, mood chips, the same grounded
// Reflect prompt. The hero photo is the Pale Blue Dot frame.

export function MockupNominee() {
  return (
    <div className="stage" style={{ height: "100%", padding: "20px 24px 28px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <p className="p-meta">For Ann · From Carl</p>
        <p
          className="p-meta"
          style={{ color: "var(--color-moss)" }}
        >
          ◯ Held
        </p>
      </div>

      <h2
        className="font-serif mt-4"
        style={{
          fontSize: 26,
          fontWeight: 400,
          lineHeight: 1.15,
          letterSpacing: "-0.005em",
          color: "var(--color-ink)",
        }}
      >
        A memory from <em className="italic">February</em>.
      </h2>

      {/* Hero "photo" — a painted Pale Blue Dot in CSS so we don't need a JPEG. */}
      <div
        style={{
          marginTop: 16,
          height: 220,
          borderRadius: 14,
          overflow: "hidden",
          position: "relative",
          background:
            "radial-gradient(ellipse at 52% 50%, rgba(255,250,234,0.20) 0%, rgba(0,0,0,0) 18%), radial-gradient(ellipse at 60% 70%, rgba(70,80,110,0.4) 0%, rgba(0,0,0,0.8) 60%), linear-gradient(180deg, #0e0d12 0%, #1a1923 100%)",
          border: "1px solid var(--color-rule)",
          boxShadow: "inset 0 0 60px rgba(0,0,0,0.4)",
        }}
      >
        {/* the pale dot */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: "53%",
            transform: "translate(-50%, -50%)",
            width: 4,
            height: 4,
            borderRadius: 999,
            background: "#9ab8d8",
            boxShadow: "0 0 8px rgba(180, 210, 240, 0.8)",
          }}
        />
        {/* sun beam */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "52%",
            width: 80,
            transform: "translateX(-50%)",
            background:
              "linear-gradient(180deg, rgba(255,238,200,0.15) 0%, rgba(255,238,200,0.05) 60%, transparent 100%)",
            filter: "blur(8px)",
          }}
        />
        {/* caption */}
        <div
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            bottom: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            color: "#F2ECDD",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: 13.5,
              lineHeight: 1.4,
              maxWidth: "75%",
              textShadow: "0 1px 2px rgba(0,0,0,0.6)",
            }}
          >
            The pale blue speck — a bit right of center.
          </p>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            14 Feb 1990
          </p>
        </div>
      </div>

      {/* Mood chips */}
      <div style={{ marginTop: 20 }}>
        <p className="p-meta" style={{ marginBottom: 8 }}>
          How are you, today?
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            "I miss them",
            "I feel small",
            "I am proud",
            "I am unsure",
            "Nothing in particular",
          ].map((m) => (
            <span
              key={m}
              className="chip"
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: 12.5,
                color: "var(--color-sepia)",
                background: "transparent",
              }}
            >
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* Reflect quiet entry */}
      <div
        style={{
          marginTop: 20,
          padding: "14px 16px",
          border: "1px solid var(--color-rule)",
          borderRadius: 12,
          background: "var(--color-bg-raised)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "var(--color-ink-muted)",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
          <circle
            cx="9"
            cy="9"
            r="4.5"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M12.5 12.5L16 16"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 14.5,
          }}
        >
          Ask, in your own words.
        </span>
      </div>
    </div>
  );
}

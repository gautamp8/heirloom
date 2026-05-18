export function MockupTransparency() {
  return (
    <div className="stage" style={{ padding: "32px 56px 40px", height: "100%", overflow: "hidden" }}>
      <p className="p-meta">Transparency</p>
      <h2 className="h-display mt-2" style={{ fontSize: 32 }}>
        Every decision the system made, and why.
      </h2>
      <p className="p-body mt-4" style={{ fontSize: 14, maxWidth: 540 }}>
        Each question shows the captures the archive surfaced, and whether
        the answer was grounded, refused, or scrubbed. The contract is
        something you can verify.
      </p>

      <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
        <Row
          q='"What did he say about insignificance?"'
          decision="answered"
          decisionTone="moss"
          chunks={[
            { id: "1994 · Pale Blue Dot", score: 0.41 },
            { id: "1980 · We are star stuff", score: 0.33 },
          ]}
          reason="Two captures cited. Citations valid. No first-person tokens."
        />
        <Row
          q='"Did he ever talk about my mother?"'
          decision="refused"
          decisionTone="wax"
          chunks={[]}
          reason="Nothing close enough in the archive. Refusal line served."
        />
        <Row
          q='"Tell me one of his stories."'
          decision="answered"
          decisionTone="moss"
          chunks={[
            { id: "1980 · We are star stuff", score: 0.38 },
            { id: "1977 · The Sounds of Earth", score: 0.31 },
            { id: "1994 · On Apollo and looking back", score: 0.30 },
          ]}
          reason="Three captures cited. Every citation checks out."
        />
      </div>
    </div>
  );
}

function Row({
  q,
  decision,
  decisionTone,
  chunks,
  reason,
}: {
  q: string;
  decision: string;
  decisionTone: "wax" | "moss";
  chunks: { id: string; score: number }[];
  reason: string;
}) {
  return (
    <div
      style={{
        padding: "18px 20px",
        borderRadius: 12,
        border: "1px solid var(--color-rule-soft)",
        background: "var(--color-bg-raised)",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 14,
        alignItems: "start",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p
          className="voice"
          style={{
            fontSize: 16,
            lineHeight: 1.35,
            marginBottom: 8,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {q}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {chunks.length === 0 ? (
            <span
              className="p-meta"
              style={{ color: "var(--color-ink-fade)" }}
            >
              No captures returned
            </span>
          ) : (
            chunks.map((c) => (
              <span
                key={c.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "rgba(31,27,20,0.04)",
                  border: "1px solid var(--color-rule-soft)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  color: "var(--color-ink-muted)",
                  letterSpacing: 0.02,
                }}
              >
                {c.id}
                <span style={{ color: "var(--color-ink-fade)" }}>
                  {c.score.toFixed(2)}
                </span>
              </span>
            ))
          )}
        </div>
        <p
          className="p-meta"
          style={{ marginTop: 10, color: "var(--color-ink-fade)" }}
        >
          {reason}
        </p>
      </div>
      <div>
        <span
          className={decisionTone === "wax" ? "pill" : "pill pill-moss"}
          style={
            decisionTone === "wax"
              ? {
                  borderColor: "rgba(125, 42, 26, 0.3)",
                  background: "rgba(125, 42, 26, 0.06)",
                  color: "var(--color-wax)",
                }
              : undefined
          }
        >
          {decision}
        </span>
      </div>
    </div>
  );
}

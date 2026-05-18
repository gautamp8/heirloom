// The verbatim refusal that the system serves when retrieval finds nothing.

export function MockupEmptyState() {
  return (
    <div
      className="stage"
      style={{
        height: "100%",
        padding: 40,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <p className="p-meta">Reflect</p>
      <p
        className="voice"
        style={{ marginTop: 14, fontSize: 19, lineHeight: 1.35 }}
      >
        "Did he ever talk about my mother?"
      </p>

      <div
        style={{
          marginTop: 36,
          padding: "22px 26px",
          maxWidth: 460,
          background: "var(--color-bg-raised)",
          border: "1px solid var(--color-rule)",
          borderRadius: 14,
        }}
      >
        <p
          className="voice"
          style={{
            fontSize: 17,
            lineHeight: 1.45,
            color: "var(--color-ink)",
          }}
        >
          I don't have that in the archive. Try asking another way?
        </p>
      </div>

      <p
        className="p-meta"
        style={{ marginTop: 26, color: "var(--color-ink-fade)" }}
      >
        The model was never invoked
      </p>
    </div>
  );
}

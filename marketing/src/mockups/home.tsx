// Creator home, faithful to src/app/_components/home.tsx.
// Daily prompt card + capture chips + recent feed.

import { IconMic, IconNote, IconPhoto, IconVideo } from "@/components/icons";

export function MockupHome() {
  return (
    <div
      className="stage"
      style={{ height: "100%", padding: "20px 24px 24px", overflow: "hidden" }}
    >
      <p className="p-meta">Thursday, 18 May</p>
      <h1
        className="font-serif mt-1.5"
        style={{
          fontSize: 32,
          fontWeight: 400,
          lineHeight: 1.05,
          letterSpacing: "-0.01em",
          color: "var(--color-ink)",
        }}
      >
        Good morning,
        <em
          className="italic"
          style={{
            marginLeft: "0.28em",
            color: "var(--color-wax)",
            letterSpacing: "0.005em",
          }}
        >
          Carl
        </em>
      </h1>

      {/* A place to begin */}
      <div
        style={{
          marginTop: 22,
          padding: "20px 20px 18px",
          borderRadius: 14,
          background: "var(--color-paper-2)",
          border: "1px solid var(--color-rule)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <span className="p-meta">A place to begin</span>
          <span
            className="p-meta"
            style={{ color: "var(--color-ink-fade)", fontSize: 9.5 }}
          >
            Another →
          </span>
        </div>
        <p
          className="voice"
          style={{ fontSize: 20, lineHeight: 1.35 }}
        >
          The view from the moon was a homecoming of a different kind. What is
          the homecoming you most remember?
        </p>
      </div>

      {/* Capture chips */}
      <div
        style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}
      >
        {[
          { icon: <IconMic size={15} />, label: "Voice" },
          { icon: <IconNote size={15} />, label: "Note" },
          { icon: <IconPhoto size={15} />, label: "Photo" },
          { icon: <IconVideo size={15} />, label: "Video" },
        ].map((c) => (
          <div
            key={c.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "10px 16px",
              borderRadius: 999,
              border: "1px solid var(--color-rule)",
              background: "var(--color-bg-raised)",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              color: "var(--color-ink)",
            }}
          >
            {c.icon}
            {c.label}
          </div>
        ))}
      </div>

      {/* Ask a line */}
      <div
        style={{
          marginTop: 24,
          padding: "14px 16px",
          border: "1px solid var(--color-rule)",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--color-bg-raised)",
          color: "var(--color-ink-muted)",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
          <circle cx="9" cy="9" r="4.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 14.5,
          }}
        >
          Ask the archive…
        </span>
      </div>

      {/* Recent */}
      <div style={{ marginTop: 22 }}>
        <p className="p-meta" style={{ marginBottom: 10 }}>
          Recent
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <FeedRow
            title="Pale Blue Dot"
            kind="note"
            excerpt="Look again at that dot. That's here. That's home. That's us."
            date="1994"
          />
          <FeedRow
            title="Science as a way of thinking"
            kind="note"
            excerpt="Science is more than a body of knowledge. It's a way of thinking."
            date="1996"
          />
        </div>
      </div>
    </div>
  );
}

function FeedRow({
  title,
  kind,
  excerpt,
  date,
}: {
  title: string;
  kind: string;
  excerpt: string;
  date: string;
}) {
  return (
    <div
      style={{
        padding: "14px 16px",
        background: "var(--color-bg-raised)",
        border: "1px solid var(--color-rule-soft)",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <h3
          className="h-section"
          style={{ fontSize: 16, lineHeight: 1.2 }}
        >
          {title}
        </h3>
        <span className="p-meta" style={{ fontSize: 9 }}>
          {kind} · {date}
        </span>
      </div>
      <p
        className="voice"
        style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.5 }}
      >
        {excerpt}
      </p>
    </div>
  );
}

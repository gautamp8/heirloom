// Note composer with a typing line, blinking cursor.
import { IconMic, IconPhoto } from "@/components/icons";

export function MockupCapture({ typed = "Look again at that dot." }: { typed?: string }) {
  return (
    <div
      className="stage"
      style={{ height: "100%", padding: "20px 24px", display: "flex", flexDirection: "column" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span className="p-meta">Local only · capture</span>
        <span className="p-meta">Cancel</span>
      </div>

      <p className="voice" style={{ marginTop: 26, fontSize: 21, lineHeight: 1.32 }}>
        What is one thing you would want them to know, when you are no longer
        in the room?
      </p>

      <div
        style={{
          marginTop: 20,
          minHeight: 220,
          padding: "16px 18px",
          background: "var(--color-bg-raised)",
          border: "1px solid var(--color-rule)",
          borderRadius: 12,
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 18,
            lineHeight: 1.5,
            color: "var(--color-ink)",
          }}
        >
          {typed}
          <span className="type-cursor" />
        </p>
      </div>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          gap: 10,
          paddingTop: 16,
        }}
      >
        <button
          type="button"
          style={{
            flex: 1,
            height: 50,
            borderRadius: 999,
            background: "var(--color-ink)",
            color: "var(--color-paper)",
            border: "1px solid var(--color-ink)",
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            fontSize: 14,
          }}
        >
          Save
        </button>
        <button
          type="button"
          aria-label="Voice memo"
          style={{
            width: 50,
            height: 50,
            borderRadius: 999,
            background: "var(--color-bg-raised)",
            border: "1px solid var(--color-rule)",
            display: "grid",
            placeItems: "center",
            color: "var(--color-ink)",
          }}
        >
          <IconMic size={18} />
        </button>
        <button
          type="button"
          aria-label="Add photo"
          style={{
            width: 50,
            height: 50,
            borderRadius: 999,
            background: "var(--color-bg-raised)",
            border: "1px solid var(--color-rule)",
            display: "grid",
            placeItems: "center",
            color: "var(--color-ink)",
          }}
        >
          <IconPhoto size={18} />
        </button>
      </div>
    </div>
  );
}

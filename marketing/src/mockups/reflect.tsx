// Reflect view: a synthesized answer with citation chips. Optional
// `showDrawer` slides up a source drawer with the original capture
// text and a "Hear in their voice" button.
import { IconChevron } from "@/components/icons";

type Props = {
  showDrawer?: boolean;
  desktop?: boolean;
};

export function MockupReflect({ showDrawer = false, desktop = false }: Props) {
  const padX = desktop ? 64 : 22;
  return (
    <div
      className="stage"
      style={{
        height: "100%",
        padding: `28px ${padX}px 0`,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <p className="p-meta">Reflect</p>

      <p
        className="voice"
        style={{
          marginTop: 14,
          fontSize: desktop ? 22 : 19,
          lineHeight: 1.35,
        }}
      >
        &ldquo;What did he say about insignificance?&rdquo;
      </p>

      <div style={{ marginTop: 18, maxWidth: 640 }}>
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: desktop ? 19 : 16.5,
            lineHeight: 1.55,
            color: "var(--color-ink)",
          }}
        >
          He returned often to the same image. The Earth as a pale point of
          light, seen from beyond Neptune
          <Cite n={1} />, against an unimaginable dark. He used it less to
          diminish us than to underline our responsibility to one another, and
          to the only home we have known
          <Cite n={2} />.
        </p>
      </div>

      {/* Citation source line */}
      <div
        style={{
          marginTop: 22,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span className="p-meta">Cited from</span>
        <span className="chip-citation chip">[1] Pale Blue Dot · 1994</span>
        <span className="chip-citation chip">[2] On Apollo and looking back</span>
      </div>

      {/* Source drawer (slides up) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: showDrawer ? 0 : "-58%",
          height: "62%",
          background: "var(--color-bg-raised)",
          borderTop: "1px solid var(--color-rule)",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: "var(--shadow-paper-3)",
          padding: `22px ${padX}px 24px`,
          transition: "bottom 520ms var(--ease-paper)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <p className="p-meta">Source · note</p>
            <h3
              className="h-section"
              style={{ fontSize: desktop ? 22 : 18, marginTop: 4 }}
            >
              Pale Blue Dot
            </h3>
          </div>
          <button
            type="button"
            className="btn-secondary btn"
            style={{ padding: "8px 14px", fontSize: 12.5 }}
            aria-label="Hear in their voice"
          >
            Hear in their voice
            <IconChevron size={12} />
          </button>
        </div>
        <p
          className="voice"
          style={{
            marginTop: 14,
            fontSize: desktop ? 15.5 : 14,
            lineHeight: 1.65,
            maxHeight: 220,
            overflow: "hidden",
          }}
        >
          Look again at that dot. That's here. That's home. That's us. On it
          everyone you love, everyone you know, everyone you ever heard of,
          every human being who ever was, lived out their lives. To me, it
          underscores our responsibility to deal more kindly with one another,
          and to preserve and cherish the pale blue dot, the only home we've
          ever known.
        </p>
      </div>
    </div>
  );
}

function Cite({ n }: { n: number }) {
  return (
    <sup
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        borderRadius: 999,
        background: "rgba(125, 42, 26, 0.08)",
        border: "1px solid rgba(125, 42, 26, 0.25)",
        color: "var(--color-wax)",
        fontFamily: "var(--font-mono)",
        fontSize: 9.5,
        letterSpacing: 0,
        marginLeft: 2,
        marginRight: 1,
        verticalAlign: "super",
        animation: "citation-pulse 2.2s var(--ease-paper) infinite",
      }}
    >
      {n}
    </sup>
  );
}

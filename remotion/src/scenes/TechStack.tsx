import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { colors, fadeUp, paperPageStyle } from "../theme";
import { fontFamilies } from "../fonts";

/** 5s lower-third / interstitial. Top: Ollama mark + typeset Gemma /
 *  EmbeddingGemma. Bottom: two rows of chip badges that pair short
 *  copy with line icons - the "running locally / no cloud / no
 *  telemetry" pillars and the "PWA / macOS app" availability. */
export const TechStackScene: React.FC = () => {
  const frame = useCurrentFrame();

  const eyebrow = fadeUp({ frame, from: 0, dur: 18, translate: 8 });
  const col1 = fadeUp({ frame, from: 18, dur: 24, translate: 14 });
  const col2 = fadeUp({ frame, from: 30, dur: 24, translate: 14 });
  const col3 = fadeUp({ frame, from: 42, dur: 24, translate: 14 });
  const pillRow1 = fadeUp({ frame, from: 60, dur: 24, translate: 10 });
  const pillRow2 = fadeUp({ frame, from: 78, dur: 24, translate: 10 });

  const fadeOut = interpolate(frame, [125, 150], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...paperPageStyle, opacity: fadeOut }}>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          gap: 48,
        }}
      >
        <div
          style={{
            ...eyebrow,
            fontFamily: fontFamilies.mono,
            fontSize: 20,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            color: colors.inkMuted,
          }}
        >
          Powered by
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 140,
          }}
        >
          <Column
            style={col1}
            mark={
              <Img
                src={staticFile("logos/ollama.png")}
                style={{
                  height: 140,
                  width: "auto",
                  objectFit: "contain",
                  filter: "saturate(0.9)",
                }}
              />
            }
            label="Ollama"
          />
          <Column style={col2} mark={<GemmaGlyph />} label="Gemma 4" />
          <Column
            style={col3}
            mark={<EmbeddingGemmaGlyph />}
            label="EmbeddingGemma"
          />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
            marginTop: 8,
          }}
        >
          <PillRow
            style={pillRow1}
            pills={[
              { icon: <HomeIcon />, label: "Running locally" },
              { icon: <CloudOffIcon />, label: "No cloud" },
              { icon: <EyeOffIcon />, label: "No telemetry" },
            ]}
          />
          <PillRow
            style={pillRow2}
            pills={[
              { icon: <InstallIcon />, label: "Install as a PWA" },
              { icon: <DesktopIcon />, label: "macOS desktop app" },
            ]}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Column: React.FC<{
  style: React.CSSProperties;
  mark: React.ReactNode;
  label: string;
}> = ({ style, mark, label }) => (
  <div
    style={{
      ...style,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 22,
      width: 280,
    }}
  >
    <div
      style={{
        height: 130,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {mark}
    </div>
    <div
      style={{
        fontFamily: fontFamilies.serif,
        fontSize: 44,
        fontWeight: 400,
        color: colors.ink,
        letterSpacing: "-0.005em",
      }}
    >
      {label}
    </div>
  </div>
);

const GemmaGlyph: React.FC = () => (
  <div
    style={{
      width: 110,
      height: 110,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <span
      style={{
        fontFamily: fontFamilies.serif,
        fontSize: 130,
        fontStyle: "italic",
        fontWeight: 300,
        color: colors.wax,
        lineHeight: 1,
        letterSpacing: "-0.04em",
      }}
    >
      G
    </span>
  </div>
);

const EmbeddingGemmaGlyph: React.FC = () => {
  const dot = (size: number, opacity = 1) => (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: colors.wax,
        opacity,
      }}
    />
  );
  return (
    <div
      style={{
        width: 110,
        height: 110,
        display: "grid",
        gridTemplateColumns: "repeat(3, auto)",
        gap: 12,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {dot(20, 0.6)}
      {dot(28)}
      {dot(20, 0.6)}
      {dot(28)}
      {dot(20, 0.4)}
      {dot(28)}
      {dot(20, 0.6)}
      {dot(28)}
      {dot(20, 0.6)}
    </div>
  );
};

// ─── Pills ────────────────────────────────────────────────────────────

type Pill = { icon: React.ReactNode; label: string };

const PillRow: React.FC<{ style: React.CSSProperties; pills: Pill[] }> = ({
  style,
  pills,
}) => (
  <div
    style={{
      ...style,
      display: "flex",
      gap: 16,
      flexWrap: "wrap",
      justifyContent: "center",
    }}
  >
    {pills.map((p, i) => (
      <PillBadge key={i} icon={p.icon} label={p.label} />
    ))}
  </div>
);

const PillBadge: React.FC<Pill> = ({ icon, label }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 16,
      padding: "18px 32px",
      borderRadius: 999,
      border: `1.5px solid ${colors.rule}`,
      background: colors.bgRaised,
      fontFamily: fontFamilies.mono,
      fontSize: 22,
      letterSpacing: "0.2em",
      textTransform: "uppercase",
      color: colors.inkSoft,
      boxShadow: "0 1px 0 rgba(31,27,20,0.02)",
    }}
  >
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: colors.wax,
      }}
    >
      {icon}
    </span>
    {label}
  </div>
);

// ─── Inline icons (32x32, stroke only) ────────────────────────────────

const STROKE = 1.8;
const ICON_SIZE = 32;

function svgProps() {
  return {
    width: ICON_SIZE,
    height: ICON_SIZE,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: STROKE,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

const HomeIcon: React.FC = () => (
  <svg {...svgProps()}>
    <path d="M3 11.5 L12 4 L21 11.5" />
    <path d="M5 10.5 V20 H19 V10.5" />
    <path d="M10 20 V14 H14 V20" />
  </svg>
);

const CloudOffIcon: React.FC = () => (
  <svg {...svgProps()}>
    <path d="M6.5 18 H17 a4 4 0 0 0 0.6 -7.95 A5.5 5.5 0 0 0 7.2 9 a4 4 0 0 0 -0.7 9" />
    <line x1="3.5" y1="3.5" x2="20.5" y2="20.5" />
  </svg>
);

const EyeOffIcon: React.FC = () => (
  <svg {...svgProps()}>
    <path d="M3 12 c2 -4 5 -6 9 -6 c4 0 7 2 9 6 c-2 4 -5 6 -9 6 c-4 0 -7 -2 -9 -6 Z" />
    <circle cx="12" cy="12" r="2.5" />
    <line x1="3.5" y1="3.5" x2="20.5" y2="20.5" />
  </svg>
);

const InstallIcon: React.FC = () => (
  <svg {...svgProps()}>
    <rect x="6" y="2.5" width="12" height="19" rx="2.2" />
    <path d="M12 8 V14" />
    <path d="M9.5 11.5 L12 14 L14.5 11.5" />
    <line x1="10.5" y1="18.5" x2="13.5" y2="18.5" />
  </svg>
);

const DesktopIcon: React.FC = () => (
  <svg {...svgProps()}>
    <rect x="2.5" y="4" width="19" height="13" rx="1.6" />
    <line x1="2.5" y1="13.5" x2="21.5" y2="13.5" />
    <circle cx="6" cy="15.2" r="0.6" fill="currentColor" />
    <path d="M9 20.5 H15" />
    <path d="M10 17.5 L9.5 20.5" />
    <path d="M14 17.5 L14.5 20.5" />
  </svg>
);

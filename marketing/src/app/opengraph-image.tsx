import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Heirloom — Preserve presence across generations";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(ellipse at 20% 10%, rgba(255,243,210,0.45), transparent 60%), radial-gradient(ellipse at 90% 90%, rgba(180,120,40,0.08), transparent 60%), #FAF7F0",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          fontFamily: "Georgia, serif",
          color: "#1F1B14",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Wax />
          <span
            style={{
              fontSize: 36,
              letterSpacing: "-0.012em",
              fontWeight: 400,
            }}
          >
            Heirloom
          </span>
          <span
            style={{
              marginLeft: 12,
              padding: "6px 14px",
              borderRadius: 999,
              border: "1px solid rgba(201,137,42,0.40)",
              background: "rgba(201,137,42,0.08)",
              color: "#C9892A",
              fontSize: 18,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontFamily: "ui-monospace, Menlo, monospace",
            }}
          >
            Beta
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <h1
            style={{
              fontSize: 88,
              lineHeight: 1.04,
              letterSpacing: "-0.018em",
              fontWeight: 300,
              margin: 0,
              maxWidth: 980,
              display: "block",
            }}
          >
            Preserve <i style={{ color: "#7D2A1A" }}>presence</i> across
            generations.
          </h1>
          <p
            style={{
              fontSize: 28,
              lineHeight: 1.4,
              color: "#4A4338",
              margin: 0,
              maxWidth: 940,
              fontFamily: "ui-sans-serif, system-ui",
              fontWeight: 400,
            }}
          >
            A private, local-first archive for the voice, photographs, and
            letters someone wanted to leave behind.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 18,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#8C8472",
          }}
        >
          <span>Gemma 4 · Ollama · Apache 2.0</span>
          <span>No telemetry · Local-first by default</span>
        </div>
      </div>
    ),
    { ...size },
  );
}

function Wax() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <radialGradient id="og-wax" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#A23F2A" />
          <stop offset="0.55" stopColor="#7D2A1A" />
          <stop offset="1" stopColor="#5C1F12" />
        </radialGradient>
      </defs>
      <g transform="translate(32 32)">
        <ellipse cx="0" cy="0" rx="28" ry="26" fill="url(#og-wax)" />
        <text
          x="0"
          y="6"
          textAnchor="middle"
          fontFamily="Georgia, serif"
          fontStyle="italic"
          fontSize="30"
          fill="#F2ECDD"
          opacity="0.85"
        >
          H
        </text>
      </g>
    </svg>
  );
}

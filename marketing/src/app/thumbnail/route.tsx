import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import path from "node:path";

// Runs as a Node lambda (not edge) so we can readFileSync the seal
// PNG off disk at module-load time. The seal is the actual brand
// mark, not a SVG/HTML stand-in, so the thumbnail matches the rest
// of the marketing surfaces (nav, footer, hero).
export const runtime = "nodejs";

// Rendered at 3× the Kaggle card spec (560 × 280) so the PNG stays
// crisp on retina displays, large monitors, and print at the spec
// dimensions. Kaggle resamples on upload; supersampling at the source
// avoids the soft, anti-aliased look that 1× renders give you.
const SCALE = 3;
const BASE_WIDTH = 560;
const BASE_HEIGHT = 280;
const WIDTH = BASE_WIDTH * SCALE;
const HEIGHT = BASE_HEIGHT * SCALE;

const s = (n: number) => Math.round(n * SCALE);

// Inline the seal as a data URI once at module load. Avoids a fetch
// on every render and works the same in dev and prod.
const SEAL_DATA_URI = (() => {
  const buf = readFileSync(
    path.join(process.cwd(), "public", "seal-2x.png"),
  );
  return `data:image/png;base64,${buf.toString("base64")}`;
})();

/**
 * Heirloom writeup card thumbnail. `curl http://localhost:3001/thumbnail
 * -o thumbnail.png` to fetch a fresh render.
 */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(ellipse at 18% 8%, rgba(255,243,210,0.45), transparent 60%), radial-gradient(ellipse at 92% 92%, rgba(180,120,40,0.10), transparent 60%), #FAF7F0",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: `${s(30)}px ${s(36)}px ${s(26)}px`,
          fontFamily: "Georgia, serif",
          color: "#1F1B14",
        }}
      >
        {/* Top row: real seal + wordmark + Beta pill */}
        <div style={{ display: "flex", alignItems: "center", gap: s(12) }}>
          <img
            src={SEAL_DATA_URI}
            alt=""
            width={s(48)}
            height={s(48)}
            style={{ display: "block" }}
          />
          <span
            style={{
              fontSize: s(22),
              letterSpacing: "-0.012em",
              fontWeight: 400,
            }}
          >
            Heirloom
          </span>
          <span
            style={{
              marginLeft: s(4),
              padding: `${s(3)}px ${s(8)}px`,
              borderRadius: 9999,
              border: `${SCALE}px solid rgba(201,137,42,0.40)`,
              background: "rgba(201,137,42,0.08)",
              color: "#C9892A",
              fontSize: s(9),
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontFamily: "ui-monospace, Menlo, monospace",
            }}
          >
            Beta
          </span>
        </div>

        {/* Body: tagline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: s(10),
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: `0 ${s(12)}px`,
              fontSize: s(38),
              lineHeight: 1.05,
              letterSpacing: "-0.015em",
              fontWeight: 300,
              maxWidth: s(500),
            }}
          >
            <span>Preserve</span>
            <span style={{ color: "#7D2A1A", fontStyle: "italic" }}>
              presence
            </span>
            <span>across generations.</span>
          </div>
          <p
            style={{
              fontSize: s(13),
              lineHeight: 1.4,
              color: "#4A4338",
              margin: 0,
              maxWidth: s(460),
              fontFamily: "ui-sans-serif, system-ui",
              fontWeight: 400,
            }}
          >
            A private, local-first memory archive built on Gemma 4.
          </p>
        </div>

        {/* Bottom row: ceremonial meta */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: s(9),
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#8C8472",
          }}
        >
          <span>Gemma 4 · Ollama · Apache 2.0</span>
          <span>Nothing leaves your device</span>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
}

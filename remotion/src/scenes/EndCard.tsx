import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { colors, fadeUp, paperPageStyle } from "../theme";
import { fontFamilies } from "../fonts";

/** 3s end card. Wordmark, tagline, attributes, GitHub URL. Holds
 *  through the final frame (no out-fade) so iMovie can dissolve to
 *  black on its own timing. */
export const EndCardScene: React.FC = () => {
  const frame = useCurrentFrame();

  const seal = fadeUp({ frame, from: 0, dur: 24, translate: 6 });
  const wordmark = fadeUp({ frame, from: 14, dur: 28, translate: 12 });
  const tagline = fadeUp({ frame, from: 30, dur: 28, translate: 10 });
  const rule = interpolate(frame, [42, 66], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const attrs = fadeUp({ frame, from: 50, dur: 28, translate: 8 });
  const url = fadeUp({ frame, from: 60, dur: 28, translate: 8 });

  return (
    <AbsoluteFill style={paperPageStyle}>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
        }}
      >
        <div
          style={{
            ...seal,
            width: 130,
            height: 130,
            filter: "drop-shadow(0 12px 24px rgba(31,27,20,0.16))",
          }}
        >
          <Img
            src={staticFile("brand/seal.png")}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>

        <div
          style={{
            ...wordmark,
            fontFamily: fontFamilies.serif,
            fontSize: 104,
            fontStyle: "italic",
            fontWeight: 300,
            color: colors.ink,
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          Heirloom
        </div>

        <div
          style={{
            ...tagline,
            fontFamily: fontFamilies.serif,
            fontSize: 28,
            fontWeight: 400,
            color: colors.inkSoft,
          }}
        >
          Preserve presence across generations.
        </div>

        <div
          style={{
            width: 220,
            height: 1,
            background: colors.ruleStrong,
            transform: `scaleX(${rule})`,
            transformOrigin: "center",
            marginTop: 18,
          }}
        />

        <div
          style={{
            ...attrs,
            fontFamily: fontFamilies.mono,
            fontSize: 15,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            color: colors.inkMuted,
            marginTop: 4,
          }}
        >
          Local · Offline · Open source
        </div>

        <div
          style={{
            ...url,
            fontFamily: fontFamilies.mono,
            fontSize: 22,
            color: colors.wax,
            marginTop: 4,
          }}
        >
          github.com/gautamp8/heirloom
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { colors, fadeUp, paperPageStyle } from "../theme";
import { fontFamilies } from "../fonts";

/** 6s opener. The wax seal sets in, then "Heirloom" + tagline rise
 *  beneath it. Soft fade out at the end so iMovie can dissolve into
 *  whatever comes next. */
export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();

  const sealScale = interpolate(frame, [18, 60], [0.94, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const sealOpacity = interpolate(frame, [18, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const wordmark = fadeUp({ frame, from: 50, dur: 36, translate: 14 });
  const tagline = fadeUp({ frame, from: 78, dur: 36, translate: 10 });

  const fadeOut = interpolate(frame, [150, 180], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...paperPageStyle, opacity: fadeOut }}>
      {/* faint top + bottom hairlines, like an archive page */}
      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          top: 88,
          height: 1,
          background: colors.rule,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          bottom: 88,
          height: 1,
          background: colors.rule,
        }}
      />

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          gap: 36,
        }}
      >
        <div
          style={{
            width: 240,
            height: 240,
            opacity: sealOpacity,
            transform: `scale(${sealScale})`,
            filter: "drop-shadow(0 18px 36px rgba(31,27,20,0.18))",
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
            fontSize: 140,
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
            fontSize: 32,
            fontWeight: 400,
            color: colors.inkSoft,
            letterSpacing: "0.005em",
          }}
        >
          Preserve presence across generations.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

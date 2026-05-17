import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { colors, fadeUp, paperPageStyle } from "../theme";
import { fontFamilies } from "../fonts";

/** 3s privacy beat. Lands between the Wi-Fi-off moment and the
 *  offline Reflect query. */
export const PrivacyScene: React.FC = () => {
  const frame = useCurrentFrame();

  const eyebrow = fadeUp({ frame, from: 0, dur: 18, translate: 8 });
  const line1 = fadeUp({ frame, from: 12, dur: 24, translate: 12 });
  const line2 = fadeUp({ frame, from: 32, dur: 24, translate: 12 });
  const rule = interpolate(frame, [40, 64], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const fadeOut = interpolate(frame, [70, 90], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...paperPageStyle, opacity: fadeOut }}>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          gap: 36,
          padding: "0 160px",
        }}
      >
        <div
          style={{
            ...eyebrow,
            fontFamily: fontFamilies.mono,
            fontSize: 16,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            color: colors.wax,
          }}
        >
          Local-first
        </div>

        <div
          style={{
            ...line1,
            fontFamily: fontFamilies.serif,
            fontSize: 72,
            fontWeight: 300,
            color: colors.ink,
            textAlign: "center",
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
          }}
        >
          No cloud. No telemetry.
        </div>

        <div
          style={{
            width: 140,
            height: 1,
            background: colors.ruleStrong,
            transform: `scaleX(${rule})`,
            transformOrigin: "center",
          }}
        />

        <div
          style={{
            ...line2,
            fontFamily: fontFamilies.serif,
            fontStyle: "italic",
            fontSize: 36,
            fontWeight: 400,
            color: colors.inkSoft,
            textAlign: "center",
            letterSpacing: "0.005em",
          }}
        >
          Your archive never leaves this device.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

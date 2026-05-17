import { AbsoluteFill, Sequence } from "remotion";
import { colors } from "./theme";
import { TitleScene } from "./scenes/Title";
import { TechStackScene } from "./scenes/TechStack";
import { PrivacyScene } from "./scenes/Privacy";
import { EndCardScene } from "./scenes/EndCard";

/** Master composition. Four scenes with 1s of paper-coloured rest
 *  between them, total 570 frames (19s @ 30fps). Each scene already
 *  fades itself out into the gap so the rests read as breath rather
 *  than a cut. */
export const Combined: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.paper }}>
      <Sequence durationInFrames={TITLE_DUR} layout="none">
        <TitleScene />
      </Sequence>

      <Sequence
        from={TITLE_DUR + GAP}
        durationInFrames={TECH_DUR}
        layout="none"
      >
        <TechStackScene />
      </Sequence>

      <Sequence
        from={TITLE_DUR + GAP + TECH_DUR + GAP}
        durationInFrames={PRIVACY_DUR}
        layout="none"
      >
        <PrivacyScene />
      </Sequence>

      <Sequence
        from={TITLE_DUR + GAP + TECH_DUR + GAP + PRIVACY_DUR + GAP}
        durationInFrames={END_DUR}
        layout="none"
      >
        <EndCardScene />
      </Sequence>
    </AbsoluteFill>
  );
};

const FPS = 30;
export const TITLE_DUR = 6 * FPS;
export const TECH_DUR = 5 * FPS;
export const PRIVACY_DUR = 3 * FPS;
export const END_DUR = 3 * FPS;
export const GAP = 1 * FPS;
export const COMBINED_DUR =
  TITLE_DUR + GAP + TECH_DUR + GAP + PRIVACY_DUR + GAP + END_DUR;

import { Composition } from "remotion";
import { TitleScene } from "./scenes/Title";
import { TechStackScene } from "./scenes/TechStack";
import { PrivacyScene } from "./scenes/Privacy";
import { EndCardScene } from "./scenes/EndCard";
import {
  Combined,
  COMBINED_DUR,
  TITLE_DUR,
  TECH_DUR,
  PRIVACY_DUR,
  END_DUR,
} from "./Combined";

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Combined"
        component={Combined}
        durationInFrames={COMBINED_DUR}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="Title"
        component={TitleScene}
        durationInFrames={TITLE_DUR}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="TechStack"
        component={TechStackScene}
        durationInFrames={TECH_DUR}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="Privacy"
        component={PrivacyScene}
        durationInFrames={PRIVACY_DUR}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="EndCard"
        component={EndCardScene}
        durationInFrames={END_DUR}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};

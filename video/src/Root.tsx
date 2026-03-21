import { Composition } from 'remotion';
import { AegisDemo } from './AegisDemo';
import { AegisMarketing } from './AegisMarketing';
import { MARKETING_FPS, MARKETING_TOTAL_FRAMES } from './marketing/slides';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Primary: 1920x1080 for YouTube, judging, Loom */}
      <Composition
        id="AegisDemo"
        component={AegisDemo}
        durationInFrames={150 * 30}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* Twitter / Instagram: 1080x1080 square for social feeds */}
      <Composition
        id="AegisDemo-Square"
        component={AegisDemo}
        durationInFrames={150 * 30}
        fps={30}
        width={1080}
        height={1080}
      />
      {/* 1-minute hackathon pitch: 15 slides × 4s */}
      <Composition
        id="AegisMarketing"
        component={AegisMarketing}
        durationInFrames={MARKETING_TOTAL_FRAMES}
        fps={MARKETING_FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="AegisMarketing-Square"
        component={AegisMarketing}
        durationInFrames={MARKETING_TOTAL_FRAMES}
        fps={MARKETING_FPS}
        width={1080}
        height={1080}
      />
    </>
  );
};

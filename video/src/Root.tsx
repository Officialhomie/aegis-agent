import { Composition } from 'remotion';
import { AegisDemo } from './AegisDemo';

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
    </>
  );
};

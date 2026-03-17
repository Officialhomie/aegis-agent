import { AbsoluteFill, Sequence } from 'remotion';
import { HookScene } from './scenes/HookScene';
import { ProblemScene } from './scenes/ProblemScene';
import { ArchitectureScene } from './scenes/ArchitectureScene';
import { LiveProofScene } from './scenes/LiveProofScene';
import { ImpactScene } from './scenes/ImpactScene';

/**
 * Aegis Demo Video - 2:30 (4500 frames at 30fps)
 *
 * Scene 1 (0:00-0:15) = frames 0-449     - Hook
 * Scene 2 (0:15-0:45) = frames 450-1349   - Problem
 * Scene 3 (0:45-1:30) = frames 1350-2699  - Architecture (ORPEM)
 * Scene 4 (1:30-2:00) = frames 2700-3599  - Live Proof
 * Scene 5 (2:00-2:30) = frames 3600-4499  - Impact
 */
export const AegisDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#050508' }}>
      <Sequence from={0} durationInFrames={450}>
        <HookScene />
      </Sequence>
      <Sequence from={450} durationInFrames={900}>
        <ProblemScene />
      </Sequence>
      <Sequence from={1350} durationInFrames={1350}>
        <ArchitectureScene />
      </Sequence>
      <Sequence from={2700} durationInFrames={900}>
        <LiveProofScene />
      </Sequence>
      <Sequence from={3600} durationInFrames={900}>
        <ImpactScene />
      </Sequence>
    </AbsoluteFill>
  );
};

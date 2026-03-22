import { AbsoluteFill, Sequence } from 'remotion';
import { BotHookScene } from './bot-scenes/HookScene';
import { BotProblemScene } from './bot-scenes/ProblemScene';
import { BotOnboardingScene } from './bot-scenes/OnboardingScene';
import { BotCommandsScene } from './bot-scenes/CommandsScene';
import { BotImpactScene } from './bot-scenes/ImpactScene';

/**
 * aeg-control Demo Video — 2:30 (4500 frames at 30fps)
 *
 * Scene 1 (0:00-0:15) = frames 0-449     — Hook: "aeg-control" brand intro
 * Scene 2 (0:15-0:45) = frames 450-1349  — Problem: no consumer UI for Aegis
 * Scene 3 (0:45-1:30) = frames 1350-2699 — Onboarding: 5-step flow
 * Scene 4 (1:30-2:00) = frames 2700-3599 — Commands: /guarantee /passport /costs /audit
 * Scene 5 (2:00-2:30) = frames 3600-4499 — Impact: stats + differentiators + CTA
 */
export const AegisControlDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#050508' }}>
      <Sequence from={0} durationInFrames={450}>
        <BotHookScene />
      </Sequence>
      <Sequence from={450} durationInFrames={900}>
        <BotProblemScene />
      </Sequence>
      <Sequence from={1350} durationInFrames={1350}>
        <BotOnboardingScene />
      </Sequence>
      <Sequence from={2700} durationInFrames={900}>
        <BotCommandsScene />
      </Sequence>
      <Sequence from={3600} durationInFrames={900}>
        <BotImpactScene />
      </Sequence>
    </AbsoluteFill>
  );
};

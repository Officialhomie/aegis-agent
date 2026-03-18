import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { colors, typography } from '../theme';

const PROBLEMS = [
  { text: 'AI agents need gas to operate on-chain', icon: '⛽' },
  { text: "Agents don't have credit cards or bank accounts", icon: '💳' },
  { text: 'Running out of gas = agent stops working', icon: '🛑' },
  { text: 'Manual top-ups don\'t scale', icon: '📈' },
];

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const problems = PROBLEMS.map((p, i) => ({
    ...p,
    delay: 60 + i * 75,
  }));

  const solutionOpacity = interpolate(frame, [420, 480], [0, 1], { extrapolateRight: 'clamp' });
  const solutionY = spring({
    frame: Math.max(0, frame - 420),
    fps,
    from: 30,
    to: 0,
    config: { damping: 14 },
  });
  const fadeOut = interpolate(frame, [850, 899], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: typography.fontBody,
        background: `linear-gradient(180deg, ${colors.bg.dark} 0%, #0a0812 50%, #0d0a14 100%)`,
        opacity: fadeOut,
        overflow: 'hidden',
      }}
    >
      {/* Subtle gradient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% 0%, rgba(239, 68, 68, 0.08) 0%, transparent 60%)`,
        }}
      />

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: 900,
        }}
      >
        {/* Section title */}
        <div
          style={{
            fontSize: typography.sizes.h2,
            fontWeight: typography.weights.bold,
            color: colors.accent.rose,
            marginBottom: 56,
            opacity: interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' }),
            textTransform: 'uppercase',
            letterSpacing: 4,
          }}
        >
          The Problem
        </div>

        {/* Problem cards */}
        {problems.map((problem, i) => {
          const opacity = interpolate(frame, [problem.delay, problem.delay + 35], [0, 1], {
            extrapolateRight: 'clamp',
          });
          const x = spring({
            frame: Math.max(0, frame - problem.delay),
            fps,
            from: -80,
            to: 0,
            config: { damping: 14, stiffness: 100 },
          });
          const cardScale = spring({
            frame: Math.max(0, frame - problem.delay),
            fps,
            from: 0.95,
            to: 1,
            config: { damping: 12 },
          });

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                width: '100%',
                marginBottom: 20,
                opacity,
                transform: `translateX(${x}px) scale(${cardScale})`,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '2px solid rgba(239, 68, 68, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  flexShrink: 0,
                }}
              >
                {problem.icon}
              </div>
              <div
                style={{
                  flex: 1,
                  padding: '20px 28px',
                  borderRadius: 16,
                  background: colors.gradient.card,
                  border: `1px solid ${colors.bg.border}`,
                  fontSize: typography.sizes.body,
                  color: colors.text.primary,
                  fontWeight: typography.weights.medium,
                }}
              >
                {problem.text}
              </div>
            </div>
          );
        })}

        {/* Solution hook */}
        <div
          style={{
            marginTop: 72,
            textAlign: 'center',
            opacity: solutionOpacity,
            transform: `translateY(${solutionY}px)`,
          }}
        >
          <div
            style={{
              fontSize: typography.sizes.caption,
              color: colors.accent.purple,
              fontWeight: typography.weights.medium,
              marginBottom: 16,
            }}
          >
            What if there was an autonomous agent
          </div>
          <div
            style={{
              fontSize: typography.sizes.h3,
              color: colors.text.primary,
              fontWeight: typography.weights.bold,
              lineHeight: 1.3,
              maxWidth: 700,
            }}
          >
            whose only job is to keep other agents running?
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { colors, typography } from '../theme';

const STATS = [
  { label: 'Tests Passing', value: 39, color: colors.accent.green },
  { label: 'Git Commits', value: 33, color: colors.accent.cyan },
  { label: 'Showcase Commands', value: 5, color: colors.accent.purple },
  { label: 'EIP-712 Compatible', value: 100, suffix: '%', color: colors.accent.amber },
];

const DIFFERENTIATORS = [
  { text: 'No wallet or crypto knowledge required', color: colors.accent.cyan },
  { text: 'Natural language commands forwarded to Aegis', color: colors.accent.purple },
  { text: 'Daily spend enforced by EIP-712 delegation', color: colors.accent.amber },
  { text: 'Real-time push notifications from agent', color: colors.accent.green },
];

export const BotImpactScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = spring({ frame, fps, from: 32, to: 0, config: { damping: 14, stiffness: 120 } });

  const ctaOpacity = interpolate(frame, [700, 760], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const fadeOut = interpolate(frame, [840, 899], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg.dark,
        opacity: fadeOut,
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: colors.gradient.mesh }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 80% 50% at 50% 100%, rgba(168, 85, 247, 0.18) 0%, transparent 65%)',
        }}
      />

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '0 80px',
          gap: 48,
        }}
      >
        {/* Title */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: typography.fontDisplay,
              fontSize: typography.sizes.h1,
              fontWeight: typography.weights.extrabold,
              color: colors.text.primary,
              letterSpacing: -2,
            }}
          >
            Built and tested, ready to deploy
          </div>
        </div>

        {/* Stat counters */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 24,
            width: '100%',
            maxWidth: 1400,
          }}
        >
          {STATS.map((stat, i) => {
            const delay = 80 + i * 80;
            const statOpacity = interpolate(frame, [delay, delay + 30], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const statY = spring({
              frame: Math.max(0, frame - delay),
              fps,
              from: 24,
              to: 0,
              config: { damping: 14, stiffness: 140 },
            });
            const countProgress = interpolate(frame, [delay + 20, delay + 120], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const displayValue = Math.round(countProgress * stat.value);
            return (
              <div
                key={stat.label}
                style={{
                  opacity: statOpacity,
                  transform: `translateY(${statY}px)`,
                  background: colors.bg.card,
                  border: `1px solid ${stat.color}33`,
                  borderRadius: 16,
                  padding: '28px 24px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: typography.fontDisplay,
                    fontSize: 72,
                    fontWeight: typography.weights.extrabold,
                    color: stat.color,
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {displayValue}
                  {stat.suffix ?? ''}
                </div>
                <div
                  style={{
                    marginTop: 12,
                    fontSize: typography.sizes.body,
                    fontWeight: typography.weights.semibold,
                    color: colors.text.secondary,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Differentiators */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            width: '100%',
            maxWidth: 900,
          }}
        >
          {DIFFERENTIATORS.map((item, i) => {
            const delay = 420 + i * 70;
            const itemOpacity = interpolate(frame, [delay, delay + 30], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const itemX = spring({
              frame: Math.max(0, frame - delay),
              fps,
              from: -30,
              to: 0,
              config: { damping: 14, stiffness: 160 },
            });
            return (
              <div
                key={item.text}
                style={{
                  opacity: itemOpacity,
                  transform: `translateX(${itemX}px)`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: item.color,
                    boxShadow: `0 0 8px ${item.color}`,
                    flexShrink: 0,
                  }}
                />
                <div
                  style={{
                    fontSize: typography.sizes.h3,
                    fontWeight: typography.weights.semibold,
                    color: colors.text.primary,
                  }}
                >
                  {item.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div
          style={{
            opacity: ctaOpacity,
            fontSize: typography.sizes.body,
            fontWeight: typography.weights.semibold,
            color: colors.text.muted,
            fontFamily: typography.fontMono,
          }}
        >
          github.com/Officialhomie/aeg-control · Open source · MIT
        </div>
      </div>
    </AbsoluteFill>
  );
};

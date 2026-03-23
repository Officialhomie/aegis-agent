import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { colors, typography } from '../theme';

const CARDS = [
  { icon: '🔌', label: 'Aegis has no consumer UI', detail: 'You need to call the API directly' },
  { icon: '📱', label: 'No mobile interface', detail: 'Judges and users can\'t interact on the go' },
  { icon: '📊', label: 'No spending visibility', detail: 'Budget burn is invisible without a dashboard' },
  { icon: '🔐', label: 'Crypto UX is a barrier', detail: 'Wallets and keys block non-technical users' },
];

export const BotProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = spring({ frame, fps, from: 32, to: 0, config: { damping: 14, stiffness: 120 } });

  const solutionOpacity = interpolate(frame, [680, 730], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const solutionY = spring({ frame: Math.max(0, frame - 680), fps, from: 20, to: 0, config: { damping: 14 } });

  const fadeOut = interpolate(frame, [850, 899], [1, 0], {
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
      {/* Gradient mesh */}
      <div style={{ position: 'absolute', inset: 0, background: colors.gradient.mesh }} />
      {/* Rose tint for problem framing */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(244, 63, 94, 0.12) 0%, transparent 60%)',
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
              color: colors.accent.rose,
              letterSpacing: -2,
            }}
          >
            Aegis is powerful, but...
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: typography.sizes.h3,
              fontWeight: typography.weights.medium,
              color: colors.text.secondary,
            }}
          >
            There is no consumer-facing interface.
          </div>
        </div>

        {/* Problem cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 24,
            width: '100%',
            maxWidth: 1400,
          }}
        >
          {CARDS.map((card, i) => {
            const delay = 120 + i * 90;
            const cardOpacity = interpolate(frame, [delay, delay + 30], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const cardX = spring({
              frame: Math.max(0, frame - delay),
              fps,
              from: -40,
              to: 0,
              config: { damping: 14, stiffness: 160 },
            });
            return (
              <div
                key={card.label}
                style={{
                  opacity: cardOpacity,
                  transform: `translateX(${cardX}px)`,
                  background: colors.bg.card,
                  border: `1px solid rgba(244, 63, 94, 0.25)`,
                  borderRadius: 16,
                  padding: '28px 32px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 48,
                    width: 64,
                    height: 64,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(244, 63, 94, 0.12)',
                    borderRadius: 12,
                    flexShrink: 0,
                  }}
                >
                  {card.icon}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: typography.sizes.h3,
                      fontWeight: typography.weights.bold,
                      color: colors.text.primary,
                      lineHeight: 1.2,
                    }}
                  >
                    {card.label}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: typography.sizes.body,
                      fontWeight: typography.weights.medium,
                      color: colors.text.secondary,
                    }}
                  >
                    {card.detail}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Solution hook */}
        <div
          style={{
            opacity: solutionOpacity,
            transform: `translateY(${solutionY}px)`,
            fontSize: typography.sizes.h3,
            fontWeight: typography.weights.semibold,
            color: colors.accent.cyan,
            textAlign: 'center',
          }}
        >
          What if Telegram could be the interface?
        </div>
      </div>
    </AbsoluteFill>
  );
};

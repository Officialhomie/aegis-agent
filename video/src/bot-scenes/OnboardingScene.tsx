import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { colors, typography } from '../theme';

const STEPS = [
  {
    num: '1',
    label: 'Create Wallet',
    detail: 'Custodial wallet generated\nAES-256-GCM encrypted key',
    color: colors.accent.blue,
    delay: 80,
  },
  {
    num: '2',
    label: 'Deposit USDC',
    detail: 'On-chain detection via viem\nLogs polled every 15 seconds',
    color: colors.accent.cyan,
    delay: 230,
  },
  {
    num: '3',
    label: 'Set Budget',
    detail: 'Daily spend limit in USD\nEnforced per delegation',
    color: colors.accent.amber,
    delay: 380,
  },
  {
    num: '4',
    label: 'Sign Delegation',
    detail: 'EIP-712 scoped to your budget\nCompatible with Aegis verify',
    color: colors.accent.purple,
    delay: 530,
  },
  {
    num: '5',
    label: 'Agent Active',
    detail: 'Natural language → Aegis\nReal-time push notifications',
    color: colors.accent.green,
    delay: 680,
  },
];

export const BotOnboardingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = spring({ frame, fps, from: 32, to: 0, config: { damping: 14, stiffness: 120 } });

  const fadeOut = interpolate(frame, [1290, 1349], [1, 0], {
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
            'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(6, 182, 212, 0.12) 0%, transparent 65%)',
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
            From /start to active agent
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: typography.sizes.h3,
              fontWeight: typography.weights.medium,
              color: colors.text.secondary,
            }}
          >
            5 steps. Under 5 minutes. No prior crypto knowledge required.
          </div>
        </div>

        {/* Steps row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            gap: 0,
            width: '100%',
            maxWidth: 1500,
          }}
        >
          {STEPS.map((step, i) => {
            const stepOpacity = interpolate(frame, [step.delay, step.delay + 30], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const stepY = spring({
              frame: Math.max(0, frame - step.delay),
              fps,
              from: 30,
              to: 0,
              config: { damping: 14, stiffness: 140 },
            });
            const connectorOpacity = interpolate(
              frame,
              [step.delay + 60, step.delay + 100],
              [0, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
            );
            const isLast = i === STEPS.length - 1;

            return (
              <div
                key={step.label}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  flex: 1,
                }}
              >
                {/* Step card */}
                <div
                  style={{
                    flex: 1,
                    opacity: stepOpacity,
                    transform: `translateY(${stepY}px)`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 16,
                  }}
                >
                  {/* Step badge */}
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: '50%',
                      background: `${step.color}22`,
                      border: `3px solid ${step.color}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: typography.fontDisplay,
                      fontSize: 32,
                      fontWeight: typography.weights.extrabold,
                      color: step.color,
                      boxShadow: `0 0 24px ${step.color}44`,
                    }}
                  >
                    {step.num}
                  </div>

                  {/* Step content */}
                  <div
                    style={{
                      background: colors.bg.card,
                      border: `1px solid ${step.color}33`,
                      borderRadius: 14,
                      padding: '20px 18px',
                      textAlign: 'center',
                      width: '100%',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: typography.weights.bold,
                        color: step.color,
                        marginBottom: 8,
                      }}
                    >
                      {step.label}
                    </div>
                    <div
                      style={{
                        fontSize: 17,
                        fontWeight: typography.weights.medium,
                        color: colors.text.secondary,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-line',
                      }}
                    >
                      {step.detail}
                    </div>
                  </div>
                </div>

                {/* Connector arrow */}
                {!isLast && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      paddingTop: 22,
                      opacity: connectorOpacity,
                      flexShrink: 0,
                      width: 32,
                      justifyContent: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 28,
                        color: colors.text.muted,
                        fontWeight: typography.weights.bold,
                      }}
                    >
                      →
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Active state callout */}
        {(() => {
          const ctaOpacity = interpolate(frame, [860, 920], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const ctaY = spring({
            frame: Math.max(0, frame - 860),
            fps,
            from: 16,
            to: 0,
            config: { damping: 14 },
          });
          return (
            <div
              style={{
                opacity: ctaOpacity,
                transform: `translateY(${ctaY}px)`,
                padding: '16px 40px',
                borderRadius: 100,
                background: `${colors.accent.green}18`,
                border: `2px solid ${colors.accent.green}55`,
                fontSize: typography.sizes.body,
                fontWeight: typography.weights.semibold,
                color: colors.accent.green,
                letterSpacing: 1,
              }}
            >
              Session active — Aegis is listening
            </div>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};

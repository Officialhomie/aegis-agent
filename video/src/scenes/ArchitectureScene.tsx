import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { colors, typography } from '../theme';

const STEPS = [
  {
    label: 'OBSERVE',
    color: colors.accent.blue,
    description: 'Scan Base for agents with low gas balances',
    detail: '7 data sources: wallets, gas prices, budgets, passports...',
    delay: 50,
  },
  {
    label: 'REASON',
    color: colors.accent.purple,
    description: 'LLM evaluates if sponsorship is warranted',
    detail: 'Confidence: 0.85 | Action: SPONSOR_TRANSACTION',
    delay: 260,
  },
  {
    label: 'POLICY',
    color: colors.accent.amber,
    description: '13 safety rules validate the decision',
    detail: 'EOA rejected | Budget checked | Rate limited',
    delay: 470,
  },
  {
    label: 'EXECUTE',
    color: colors.accent.green,
    description: 'Paymaster sponsors via ERC-4337',
    detail: 'Sign → Log on-chain → Submit UserOp → Confirm',
    delay: 680,
  },
  {
    label: 'MEMORY',
    color: colors.accent.pink,
    description: 'Decision logged on-chain + stored in vector DB',
    detail: 'AegisActivityLogger | Pinecone | IPFS backup',
    delay: 890,
  },
];

export const ArchitectureScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [1300, 1349], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: typography.fontBody,
        background: `linear-gradient(180deg, ${colors.bg.dark} 0%, #0a0c14 100%)`,
        padding: '50px 80px',
        opacity: fadeOut,
        overflow: 'hidden',
      }}
    >
      {/* Background accent */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          marginLeft: -400,
          width: 800,
          height: 400,
          background: `radial-gradient(ellipse, rgba(59, 130, 246, 0.08) 0%, transparent 70%)`,
        }}
      />

      <div
        style={{
          fontSize: typography.sizes.h2,
          fontWeight: typography.weights.bold,
          color: colors.text.primary,
          marginBottom: 8,
          opacity: titleOpacity,
          fontFamily: typography.fontDisplay,
        }}
      >
        The ORPEM Loop
      </div>
      <div
        style={{
          fontSize: typography.sizes.caption,
          color: colors.text.secondary,
          marginBottom: 48,
          opacity: titleOpacity,
          letterSpacing: 2,
        }}
      >
        Observe → Reason → Policy → Execute → Memory
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          width: '100%',
          maxWidth: 1200,
        }}
      >
        {STEPS.map((step, i) => {
          const opacity = interpolate(frame, [step.delay, step.delay + 45], [0, 1], {
            extrapolateRight: 'clamp',
          });
          const scaleVal = spring({
            frame: Math.max(0, frame - step.delay),
            fps,
            from: 0.88,
            to: 1,
            config: { damping: 14, stiffness: 100 },
          });
          const x = spring({
            frame: Math.max(0, frame - step.delay),
            fps,
            from: -40,
            to: 0,
            config: { damping: 16 },
          });

          const isActive = frame >= step.delay && frame < step.delay + 180;
          const glowOpacity = isActive ? 0.25 : 0;

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 28,
                opacity,
                transform: `scale(${scaleVal}) translateX(${x}px)`,
                position: 'relative',
              }}
            >
              {/* Connector line to next (except last) */}
              {i < STEPS.length - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    left: 52,
                    top: 72,
                    width: 2,
                    height: 28,
                    background: `linear-gradient(180deg, ${step.color} 0%, ${STEPS[i + 1].color} 100%)`,
                    opacity: interpolate(frame, [step.delay + 80, step.delay + 120], [0, 0.6], {
                      extrapolateRight: 'clamp',
                    }),
                  }}
                />
              )}

              {/* Glow behind active step */}
              <div
                style={{
                  position: 'absolute',
                  inset: -12,
                  borderRadius: 24,
                  background: step.color,
                  opacity: glowOpacity,
                  filter: 'blur(32px)',
                }}
              />

              {/* Step number badge */}
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 18,
                  background: `${step.color}18`,
                  border: `2px solid ${isActive ? step.color : step.color + '50'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26,
                  fontWeight: typography.weights.bold,
                  color: step.color,
                  flexShrink: 0,
                  position: 'relative',
                  boxShadow: `0 0 24px ${step.color}40`,
                }}
              >
                {i + 1}
              </div>

              {/* Content card */}
              <div
                style={{
                  flex: 1,
                  padding: '20px 28px',
                  borderRadius: 16,
                  background: colors.gradient.card,
                  border: `1px solid ${colors.bg.border}`,
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: typography.weights.bold,
                    color: step.color,
                    marginBottom: 6,
                    fontFamily: typography.fontDisplay,
                  }}
                >
                  {step.label}
                </div>
                <div
                  style={{
                    fontSize: typography.sizes.body,
                    color: colors.text.primary,
                    marginBottom: 4,
                  }}
                >
                  {step.description}
                </div>
                <div
                  style={{
                    fontSize: typography.sizes.small,
                    color: colors.text.muted,
                    fontFamily: typography.fontMono,
                  }}
                >
                  {step.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { colors, typography } from '../theme';

const STATS = [
  { label: 'Deployed Contracts', value: 5, color: colors.accent.blue, suffix: '' },
  { label: 'On-Chain Sponsorships', value: 50, color: colors.accent.green, suffix: '+' },
  { label: 'Policy Rules', value: 13, color: colors.accent.amber, suffix: '' },
  { label: 'Tests Passing', value: 975, color: colors.accent.purple, suffix: '' },
];

const DIFFERENTIATORS = [
  'Not a wrapper — autonomous ORPEM decision loop',
  'Safety-first — rejections logged on-chain too',
  'Agent-first — EOAs rejected, ERC-8004 prioritized',
  'Full audit trail — EIP-712 signed, on-chain, IPFS backed',
];

/** Animated counter that counts up from 0 to target */
const AnimatedCounter: React.FC<{
  value: number;
  suffix: string;
  delay: number;
  frame: number;
  fps: number;
  color: string;
}> = ({ value, suffix, delay, frame, fps, color }) => {
  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    from: 0,
    to: 1,
    config: { damping: 12, stiffness: 80 },
  });
  const displayValue = Math.round(progress * value);
  const scale = spring({
    frame: Math.max(0, frame - delay),
    fps,
    from: 0.5,
    to: 1,
    config: { damping: 14 },
  });

  return (
    <div style={{ transform: `scale(${scale})` }}>
      <span style={{ color, fontWeight: typography.weights.extrabold }}>{displayValue}</span>
      {suffix ? <span style={{ color, fontWeight: typography.weights.extrabold }}>{suffix}</span> : null}
    </div>
  );
};

export const ImpactScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: typography.fontBody,
        background: colors.bg.dark,
        overflow: 'hidden',
      }}
    >
      {/* Background gradient */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: colors.gradient.mesh,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: colors.gradient.purpleGlow,
        }}
      />

      <div style={{ position: 'relative', textAlign: 'center' }}>
        {/* Stats row with animated counters */}
        <div
          style={{
            display: 'flex',
            gap: 48,
            marginBottom: 56,
          }}
        >
          {STATS.map((stat, i) => {
            const delay = i * 50;
            const opacity = interpolate(frame, [delay, delay + 35], [0, 1], {
              extrapolateRight: 'clamp',
            });

            return (
              <div
                key={i}
                style={{
                  textAlign: 'center',
                  opacity,
                  minWidth: 180,
                }}
              >
                <div
                  style={{
                    fontSize: 80,
                    fontWeight: typography.weights.extrabold,
                    lineHeight: 1,
                    fontFamily: typography.fontDisplay,
                  }}
                >
                  <AnimatedCounter
                    value={stat.value}
                    suffix={stat.suffix}
                    delay={delay}
                    frame={frame}
                    fps={fps}
                    color={stat.color}
                  />
                </div>
                <div
                  style={{
                    fontSize: typography.sizes.caption,
                    color: colors.text.secondary,
                    marginTop: 12,
                    fontWeight: typography.weights.medium,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Differentiators */}
        <div style={{ maxWidth: 900, marginBottom: 56 }}>
          {DIFFERENTIATORS.map((diff, i) => {
            const delay = 220 + i * 55;
            const opacity = interpolate(frame, [delay, delay + 35], [0, 1], {
              extrapolateRight: 'clamp',
            });
            const x = spring({
              frame: Math.max(0, frame - delay),
              fps,
              from: -30,
              to: 0,
              config: { damping: 14 },
            });

            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  marginBottom: 18,
                  opacity,
                  transform: `translateX(${x}px)`,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: colors.accent.purple,
                    boxShadow: `0 0 12px ${colors.accent.purpleGlow}`,
                    flexShrink: 0,
                  }}
                />
                <div
                  style={{
                    fontSize: typography.sizes.body,
                    color: colors.text.primary,
                    fontWeight: typography.weights.medium,
                  }}
                >
                  {diff}
                </div>
              </div>
            );
          })}
        </div>

        {/* Final CTA */}
        <div
          style={{
            opacity: interpolate(frame, [550, 620], [0, 1], { extrapolateRight: 'clamp' }),
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: typography.sizes.body,
              color: colors.text.secondary,
              marginBottom: 12,
              fontFamily: typography.fontMono,
              letterSpacing: 1,
            }}
          >
            Open Source | Base Mainnet | clawgas.vercel.app
          </div>
          <div
            style={{
              fontSize: typography.sizes.caption,
              color: colors.text.muted,
            }}
          >
            Built for The Synthesis Hackathon
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

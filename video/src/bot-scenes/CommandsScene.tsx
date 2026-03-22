import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { colors, typography } from '../theme';

const COMMANDS = [
  {
    cmd: '/guarantee',
    desc: 'Active delegation scope and limits',
    sample: 'Contracts: USDC, WETH\nMax per tx: $5.00\nDaily cap: $50.00',
    color: colors.accent.purple,
    delay: 80,
  },
  {
    cmd: '/passport',
    desc: 'Agent identity and trust score',
    sample: 'Wallet: 0xAbCd...1234\nTier: TRUSTED\nPassport score: 82',
    color: colors.accent.blue,
    delay: 230,
  },
  {
    cmd: '/costs',
    desc: 'Daily spend vs budget',
    sample: 'Spent today: $12.40\nBudget: $50.00\nBurn rate: 24.8%',
    color: colors.accent.amber,
    delay: 380,
  },
  {
    cmd: '/audit',
    desc: 'Last 10 on-chain actions',
    sample: '0x3f..a1 swap USDC ✓\n0x7b..c2 transfer ETH ✓\n0x9e..d3 approve ERC20 ✓',
    color: colors.accent.green,
    delay: 530,
  },
];

export const BotCommandsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = spring({ frame, fps, from: 32, to: 0, config: { damping: 14, stiffness: 120 } });

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
            'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(168, 85, 247, 0.12) 0%, transparent 60%)',
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
          gap: 44,
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
            Full visibility at a glance
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: typography.sizes.h3,
              fontWeight: typography.weights.medium,
              color: colors.text.secondary,
            }}
          >
            Showcase commands surface every Aegis capability
          </div>
        </div>

        {/* Command cards grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 24,
            width: '100%',
            maxWidth: 1400,
          }}
        >
          {COMMANDS.map((cmd) => {
            const cardOpacity = interpolate(frame, [cmd.delay, cmd.delay + 30], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const cardX = spring({
              frame: Math.max(0, frame - cmd.delay),
              fps,
              from: 50,
              to: 0,
              config: { damping: 14, stiffness: 160 },
            });
            return (
              <div
                key={cmd.cmd}
                style={{
                  opacity: cardOpacity,
                  transform: `translateX(${cardX}px)`,
                  background: colors.bg.card,
                  border: `1px solid ${cmd.color}33`,
                  borderLeft: `4px solid ${cmd.color}`,
                  borderRadius: 14,
                  padding: '24px 28px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {/* Command name */}
                <div
                  style={{
                    fontFamily: typography.fontMono,
                    fontSize: 32,
                    fontWeight: typography.weights.extrabold,
                    color: cmd.color,
                    letterSpacing: -0.5,
                  }}
                >
                  {cmd.cmd}
                </div>
                {/* Description */}
                <div
                  style={{
                    fontSize: typography.sizes.body,
                    fontWeight: typography.weights.medium,
                    color: colors.text.secondary,
                  }}
                >
                  {cmd.desc}
                </div>
                {/* Sample output */}
                <div
                  style={{
                    background: colors.bg.elevated,
                    border: `1px solid ${colors.bg.borderHover}`,
                    borderRadius: 10,
                    padding: '12px 16px',
                    fontFamily: typography.fontMono,
                    fontSize: 17,
                    fontWeight: typography.weights.semibold,
                    color: colors.text.secondary,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-line',
                  }}
                >
                  {cmd.sample}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

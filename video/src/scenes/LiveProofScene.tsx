import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { colors, typography } from '../theme';

const TX_EXAMPLES = [
  { hash: '0xa8440e...bcb7e', protocol: 'uniswap-v4', block: '42602403', status: 'SUCCESS' },
  { hash: '0x3c9737...94378', protocol: 'uniswap-v4', block: '42602399', status: 'SUCCESS' },
  { hash: '0x7c06a0...f3899', protocol: 'test-protocol', block: '42009248', status: 'SUCCESS' },
  { hash: '0x6eb4db...dd9e9', protocol: 'test-protocol', block: '42000630', status: 'SUCCESS' },
];

const InfoCard: React.FC<{
  label: string;
  value: string;
  sub: string;
  color: string;
  delay: number;
  frame: number;
  fps: number;
}> = ({ label, value, sub, color, delay, frame, fps }) => {
  const opacity = interpolate(frame, [delay, delay + 30], [0, 1], { extrapolateRight: 'clamp' });
  const scale = spring({
    frame: Math.max(0, frame - delay),
    fps,
    from: 0.9,
    to: 1,
    config: { damping: 14 },
  });

  return (
    <div
      style={{
        flex: 1,
        padding: '24px 28px',
        borderRadius: 16,
        border: `1px solid ${color}40`,
        background: `${color}0c`,
        opacity,
        transform: `scale(${scale})`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${color}, transparent)`,
          opacity: 0.6,
        }}
      />
      <div
        style={{
          fontSize: 12,
          color: colors.text.muted,
          fontWeight: typography.weights.semibold,
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          color: colors.text.primary,
          fontWeight: typography.weights.bold,
          fontFamily: typography.fontMono,
          marginBottom: 6,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 13, color: colors.text.secondary }}>{sub}</div>
    </div>
  );
};

export const LiveProofScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [850, 899], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: typography.fontBody,
        background: `linear-gradient(180deg, ${colors.bg.dark} 0%, #050a08 100%)`,
        padding: '50px 80px',
        opacity: fadeOut,
        overflow: 'hidden',
      }}
    >
      {/* Green accent glow */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          marginLeft: -300,
          width: 600,
          height: 300,
          background: `radial-gradient(ellipse, rgba(16, 185, 129, 0.12) 0%, transparent 70%)`,
        }}
      />

      <div
        style={{
          fontSize: typography.sizes.h2,
          fontWeight: typography.weights.bold,
          color: colors.accent.green,
          marginBottom: 8,
          opacity: titleOpacity,
          fontFamily: typography.fontDisplay,
        }}
      >
        Live On-Chain Proof
      </div>
      <div
        style={{
          fontSize: typography.sizes.caption,
          color: colors.text.secondary,
          marginBottom: 40,
          opacity: titleOpacity,
        }}
      >
        Real transactions on Base Mainnet — verified on BaseScan
      </div>

      {/* Info cards */}
      <div
        style={{
          display: 'flex',
          gap: 20,
          marginBottom: 40,
          width: '100%',
          maxWidth: 1200,
        }}
      >
        <InfoCard
          label="AegisActivityLogger"
          value="0xC76eaA20...e97"
          sub="Base Mainnet | Verified"
          color={colors.accent.green}
          delay={30}
          frame={frame}
          fps={fps}
        />
        <InfoCard
          label="Agent Wallet"
          value="0x7B9763b4...12f"
          sub="Autonomous | ERC-8004"
          color={colors.accent.blue}
          delay={55}
          frame={frame}
          fps={fps}
        />
        <InfoCard
          label="Sponsorships"
          value="9+"
          sub="Feb 10 — Present"
          color={colors.accent.purple}
          delay={80}
          frame={frame}
          fps={fps}
        />
      </div>

      {/* Transaction table */}
      <div
        style={{
          width: '100%',
          maxWidth: 1200,
          borderRadius: 20,
          border: `1px solid ${colors.bg.border}`,
          overflow: 'hidden',
          background: colors.bg.card,
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        {/* Table header */}
        <div
          style={{
            display: 'flex',
            padding: '18px 28px',
            backgroundColor: colors.bg.elevated,
            borderBottom: `1px solid ${colors.bg.border}`,
            fontSize: 13,
            fontWeight: typography.weights.semibold,
            color: colors.text.muted,
            gap: 20,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          <div style={{ flex: 2 }}>TX Hash</div>
          <div style={{ flex: 1.5 }}>Protocol</div>
          <div style={{ flex: 1 }}>Block</div>
          <div style={{ flex: 0.8, textAlign: 'right' as const }}>Status</div>
        </div>

        {TX_EXAMPLES.map((tx, i) => {
          const rowDelay = 120 + i * 55;
          const opacity = interpolate(frame, [rowDelay, rowDelay + 35], [0, 1], {
            extrapolateRight: 'clamp',
          });
          const x = spring({
            frame: Math.max(0, frame - rowDelay),
            fps,
            from: 40,
            to: 0,
            config: { damping: 16 },
          });

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                padding: '18px 28px',
                backgroundColor: i % 2 === 0 ? colors.bg.dark : colors.bg.card,
                borderBottom: i < TX_EXAMPLES.length - 1 ? `1px solid ${colors.bg.border}` : 'none',
                fontSize: typography.sizes.body,
                color: colors.text.primary,
                gap: 20,
                opacity,
                transform: `translateX(${x}px)`,
              }}
            >
              <div
                style={{
                  flex: 2,
                  fontFamily: typography.fontMono,
                  color: colors.accent.cyan,
                  fontWeight: typography.weights.medium,
                }}
              >
                {tx.hash}
              </div>
              <div style={{ flex: 1.5 }}>{tx.protocol}</div>
              <div style={{ flex: 1, color: colors.text.secondary }}>{tx.block}</div>
              <div
                style={{
                  flex: 0.8,
                  textAlign: 'right' as const,
                  color: colors.accent.green,
                  fontWeight: typography.weights.bold,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.accent.green,
                  }}
                />
                {tx.status}
              </div>
            </div>
          );
        })}
      </div>

      {/* BaseScan link */}
      <div
        style={{
          marginTop: 28,
          fontSize: typography.sizes.small,
          color: colors.text.muted,
          fontFamily: typography.fontMono,
          opacity: interpolate(frame, [380, 420], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      >
        basescan.org/address/0xC76eaA20A3F9E074931D4B101fE59b6bf2471e97
      </div>
    </AbsoluteFill>
  );
};

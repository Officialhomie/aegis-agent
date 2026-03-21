import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { colors, typography } from '../theme';

/** Grounded in BATCH_DEMO_REPORT.md (Base mainnet batch demo, Mar 2026). */
const BATCH_SUMMARY = {
  agentsRegistered: 100,
  userOpsSubmitted: 202,
  confirmedOnChain: 123,
  successRatePct: 61,
  protocol: 'aegis-batch-demo',
};

const SAMPLE_TX = [
  { hash: '0xc1c6fcb3…5e34b3', archetype: 'Power User', status: 'CONFIRMED' },
  { hash: '0xcfd16810…f9d1c', archetype: 'DeFi Trader', status: 'CONFIRMED' },
  { hash: '0x25fc37fb…1ae3f6', archetype: 'NFT Collector', status: 'CONFIRMED' },
  { hash: '0x571e42d7…fda762', archetype: 'DeFi Trader', status: 'CONFIRMED' },
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

export const BatchDemoResultsScene: React.FC = () => {
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
        Batch demo results
      </div>
      <div
        style={{
          fontSize: typography.sizes.caption,
          color: colors.text.secondary,
          marginBottom: 40,
          opacity: titleOpacity,
          textAlign: 'center',
          maxWidth: 900,
        }}
      >
        Controlled mainnet stress run on Base — {BATCH_SUMMARY.agentsRegistered} agents,{' '}
        {BATCH_SUMMARY.userOpsSubmitted} UserOps, {BATCH_SUMMARY.confirmedOnChain} confirmed (see project report)
      </div>

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
          label="Agents registered"
          value={String(BATCH_SUMMARY.agentsRegistered)}
          sub="5 archetypes × 20"
          color={colors.accent.blue}
          delay={30}
          frame={frame}
          fps={fps}
        />
        <InfoCard
          label="UserOps submitted"
          value={String(BATCH_SUMMARY.userOpsSubmitted)}
          sub="Bundled + paymaster"
          color={colors.accent.purple}
          delay={55}
          frame={frame}
          fps={fps}
        />
        <InfoCard
          label="Confirmed on-chain"
          value={String(BATCH_SUMMARY.confirmedOnChain)}
          sub="Base mainnet receipts"
          color={colors.accent.green}
          delay={80}
          frame={frame}
          fps={fps}
        />
        <InfoCard
          label="Success rate"
          value={`${BATCH_SUMMARY.successRatePct}%`}
          sub="Includes debug / race failures"
          color={colors.accent.amber}
          delay={105}
          frame={frame}
          fps={fps}
        />
      </div>

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
          <div style={{ flex: 2 }}>TX hash (sample)</div>
          <div style={{ flex: 1.2 }}>Archetype</div>
          <div style={{ flex: 0.8, textAlign: 'right' as const }}>Status</div>
        </div>

        {SAMPLE_TX.map((tx, i) => {
          const rowDelay = 140 + i * 55;
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
                borderBottom: i < SAMPLE_TX.length - 1 ? `1px solid ${colors.bg.border}` : 'none',
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
              <div style={{ flex: 1.2 }}>{tx.archetype}</div>
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

      <div
        style={{
          marginTop: 28,
          fontSize: typography.sizes.small,
          color: colors.text.muted,
          fontFamily: typography.fontMono,
          opacity: interpolate(frame, [380, 420], [0, 1], { extrapolateRight: 'clamp' }),
          textAlign: 'center',
          maxWidth: 1000,
          lineHeight: 1.5,
        }}
      >
        Protocol {BATCH_SUMMARY.protocol} · Paymaster 0x0F64…25534 · Full hashes in BATCH_DEMO_REPORT.md / basescan.org
      </div>
    </AbsoluteFill>
  );
};

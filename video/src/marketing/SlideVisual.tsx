import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { colors, typography } from '../theme';
import { BentoCard } from './primitives/BentoCard';
import type { SlideVariant } from './slides';

type SlideVisualProps = {
  variant: SlideVariant;
};

export const SlideVisual: React.FC<SlideVisualProps> = ({ variant }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const isCompact = width < 1920;

  switch (variant) {
    case 'robotHook':
      return <VisualRobotHook frame={frame} fps={fps} compact={isCompact} />;
    case 'chatVsActions':
      return <VisualChatVsActions frame={frame} fps={fps} compact={isCompact} />;
    case 'fareTap':
      return <VisualFareTap frame={frame} fps={fps} compact={isCompact} />;
    case 'fuelGauge':
      return <VisualFuelGauge frame={frame} fps={fps} compact={isCompact} />;
    case 'twoColumnPain':
      return <VisualTwoColumnPain frame={frame} fps={fps} compact={isCompact} />;
    case 'wordmark':
      return <VisualWordmark frame={frame} fps={fps} compact={isCompact} />;
    case 'dashboard':
      return <VisualDashboard frame={frame} fps={fps} compact={isCompact} />;
    case 'fairnessMeter':
      return <VisualFairnessMeter frame={frame} fps={fps} compact={isCompact} />;
    case 'rulesChecklist':
      return <VisualRulesChecklist frame={frame} fps={fps} compact={isCompact} />;
    case 'paidStamp':
      return <VisualPaidStamp frame={frame} fps={fps} compact={isCompact} />;
    case 'receiptTrail':
      return <VisualReceiptTrail frame={frame} fps={fps} compact={isCompact} />;
    case 'networkStrip':
      return <VisualNetworkStrip frame={frame} fps={fps} compact={isCompact} />;
    case 'hackathonFrame':
      return <VisualHackathonFrame frame={frame} fps={fps} compact={isCompact} />;
    case 'demoTerminal':
      return <VisualDemoTerminal frame={frame} fps={fps} compact={isCompact} />;
    case 'ctaEnd':
      return <VisualCtaEnd frame={frame} fps={fps} compact={isCompact} />;
    default:
      return null;
  }
};

function VisualRobotHook({
  frame,
  fps,
  compact,
}: {
  frame: number;
  fps: number;
  compact: boolean;
}) {
  const bob = Math.sin(frame * 0.12) * 6;
  const pauseScale = spring({
    frame: Math.max(0, frame - 8),
    fps,
    from: 0.6,
    to: 1,
    config: { damping: 12, stiffness: 160 },
  });
  const ring = interpolate(frame, [0, 24], [0, 1], { extrapolateRight: 'clamp' });
  const size = compact ? 148 : 188;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 28 : 48 }}>
      <div
        style={{
          width: size,
          height: size * 1.1,
          borderRadius: 28,
          border: `2px solid ${colors.bg.borderHover}`,
          background: colors.bg.card,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translateY(${bob}px)`,
          fontSize: compact ? 84 : 104,
        }}
      >
        🤖
      </div>
      <div
        style={{
          width: compact ? 90 : 108,
          height: compact ? 90 : 108,
          borderRadius: 20,
          border: `2px solid ${colors.accent.rose}`,
          background: `${colors.accent.rose}18`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${pauseScale})`,
          boxShadow: `0 0 ${24 + ring * 40}px ${colors.accent.rose}55`,
          fontSize: compact ? 58 : 72,
          color: colors.accent.rose,
          fontWeight: typography.weights.extrabold,
        }}
      >
        ⏸
      </div>
    </div>
  );
}

function VisualChatVsActions({
  frame,
  fps,
  compact,
}: {
  frame: number;
  fps: number;
  compact: boolean;
}) {
  const left = spring({ frame, fps, from: -40, to: 0, config: { damping: 16, stiffness: 180 } });
  const right = spring({
    frame: Math.max(0, frame - 6),
    fps,
    from: 40,
    to: 0,
    config: { damping: 16, stiffness: 180 },
  });
  const gap = compact ? 16 : 28;
  return (
    <div style={{ display: 'flex', gap, flexWrap: compact ? 'wrap' : 'nowrap', justifyContent: 'center' }}>
      <div style={{ transform: `translateX(${left}px)`, width: compact ? '100%' : 440, maxWidth: 500 }}>
        <BentoCard accent={colors.accent.blue}>
          <div style={{ fontSize: compact ? 28 : 32, fontWeight: typography.weights.extrabold, color: colors.text.primary }}>
            💬 Chat
          </div>
          <div style={{ marginTop: 10, fontSize: compact ? 22 : 26, fontWeight: typography.weights.semibold, color: colors.text.secondary }}>
            Answers questions
          </div>
        </BentoCard>
      </div>
      <div style={{ transform: `translateX(${right}px)`, width: compact ? '100%' : 440, maxWidth: 500 }}>
        <BentoCard accent={colors.accent.purple} highlight>
          <div style={{ fontSize: compact ? 28 : 32, fontWeight: typography.weights.extrabold, color: colors.text.primary }}>
            ⚡ Actions
          </div>
          <div style={{ marginTop: 10, fontSize: compact ? 22 : 26, fontWeight: typography.weights.semibold, color: colors.text.secondary }}>
            Swaps, mints, pays, posts onchain
          </div>
        </BentoCard>
      </div>
    </div>
  );
}

function VisualFareTap({
  frame,
  fps,
  compact,
}: {
  frame: number;
  fps: number;
  compact: boolean;
}) {
  const pulses = [0, 18, 36].map((offset) =>
    spring({
      frame: Math.max(0, frame - offset),
      fps,
      from: 0.4,
      to: 1,
      config: { damping: 14, stiffness: 200 },
    }),
  );
  return (
    <div style={{ position: 'relative', width: compact ? 300 : 380, height: compact ? 240 : 280 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 100 + i * 70,
            height: 100 + i * 70,
            marginLeft: -(50 + i * 35),
            marginTop: -(50 + i * 35),
            borderRadius: '50%',
            border: `2px solid ${colors.accent.cyan}`,
            opacity: 0.35 + pulses[i] * 0.35,
            transform: `scale(${pulses[i]})`,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          padding: '24px 36px',
          borderRadius: 16,
          background: colors.bg.elevated,
          border: `1px solid ${colors.accent.cyan}`,
          fontSize: compact ? 42 : 52,
          fontWeight: typography.weights.extrabold,
          color: colors.accent.cyan,
        }}
      >
        Tap → Pay
      </div>
    </div>
  );
}

function VisualFuelGauge({
  frame,
  fps,
  compact,
}: {
  frame: number;
  fps: number;
  compact: boolean;
}) {
  const level = interpolate(frame, [15, 90], [78, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const flash = frame > 90 && frame % 20 < 10 ? 1 : 0.5;
  const w = compact ? 340 : 560;
  return (
    <div style={{ width: w }}>
      <div
        style={{
          height: compact ? 36 : 46,
          borderRadius: 12,
          background: colors.bg.elevated,
          border: `1px solid ${colors.bg.border}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${level}%`,
            borderRadius: 10,
            background:
              level < 25
                ? `linear-gradient(90deg, ${colors.accent.rose}, ${colors.accent.amber})`
                : `linear-gradient(90deg, ${colors.accent.green}, ${colors.accent.cyan})`,
            opacity: 0.85 + flash * 0.15,
          }}
        />
      </div>
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: compact ? 24 : 28,
          fontWeight: typography.weights.bold,
          color: colors.text.muted,
        }}
      >
        <span>Fuel</span>
        <span style={{ color: level < 12 ? colors.accent.rose : colors.text.secondary, fontWeight: typography.weights.extrabold }}>
          {level < 8 ? 'Empty — stuck' : `${Math.round(level)}%`}
        </span>
      </div>
    </div>
  );
}

function VisualTwoColumnPain({
  frame,
  fps,
  compact,
}: {
  frame: number;
  fps: number;
  compact: boolean;
}) {
  const y0 = spring({ frame, fps, from: 24, to: 0, config: { damping: 16, stiffness: 160 } });
  const y1 = spring({
    frame: Math.max(0, frame - 8),
    fps,
    from: 24,
    to: 0,
    config: { damping: 16, stiffness: 160 },
  });
  const op0 = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: { damping: 18, stiffness: 200 },
  });
  const op1 = spring({
    frame: Math.max(0, frame - 8),
    fps,
    from: 0,
    to: 1,
    config: { damping: 18, stiffness: 200 },
  });
  const col = (
    emoji: string,
    title: string,
    body: string,
    y: number,
    op: number,
  ) => (
    <div
      style={{
        transform: `translateY(${y}px)`,
        opacity: op,
      }}
    >
      <BentoCard accent={colors.accent.amber}>
        <div style={{ fontSize: compact ? 52 : 58 }}>{emoji}</div>
        <div style={{ marginTop: 10, fontSize: compact ? 28 : 32, fontWeight: typography.weights.extrabold, color: colors.text.primary }}>
          {title}
        </div>
        <div style={{ marginTop: 8, fontSize: compact ? 22 : 26, fontWeight: typography.weights.semibold, color: colors.text.secondary }}>
          {body}
        </div>
      </BentoCard>
    </div>
  );
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : '1fr 1fr',
        gap: compact ? 16 : 28,
        width: '100%',
        maxWidth: 920,
      }}
    >
      {col('😤', 'End users', 'Errors, retries, confusion', y0, op0)}
      {col('🛠️', 'Builders', 'Alerts, refills, firefighting', y1, op1)}
    </div>
  );
}

function VisualWordmark({
  frame,
  fps,
  compact,
}: {
  frame: number;
  fps: number;
  compact: boolean;
}) {
  const scale = spring({ frame, fps, from: 0.88, to: 1, config: { damping: 12, stiffness: 140 } });
  const glow = interpolate(frame, [0, 30], [0.3, 1], { extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        textAlign: 'center',
        transform: `scale(${scale})`,
      }}
    >
      <div
        style={{
          fontFamily: typography.fontDisplay,
          fontSize: compact ? 108 : 152,
          fontWeight: typography.weights.extrabold,
          letterSpacing: -2,
          color: colors.text.primary,
          textShadow: `0 0 ${60 * glow}px ${colors.accent.purpleGlow}, 0 0 30px rgba(168,85,247,0.35)`,
        }}
      >
        AEGIS
      </div>
      <div
        style={{
          marginTop: compact ? 18 : 24,
          fontSize: compact ? 28 : 34,
          color: colors.accent.purple,
          fontWeight: typography.weights.bold,
        }}
      >
        Policy-aware agent fuel
      </div>
    </div>
  );
}

function VisualDashboard({
  frame,
  fps,
  compact,
}: {
  frame: number;
  fps: number;
  compact: boolean;
}) {
  const rows = [
    { label: 'Agent: payments-bot', sub: 'Healthy', ok: true },
    { label: 'Agent: mint-worker', sub: 'Low fuel in ~12 txs', ok: false },
    { label: 'Agent: indexer', sub: 'Healthy', ok: true },
  ];
  return (
    <BentoCard style={{ width: '100%', maxWidth: 620, padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '18px 22px',
          borderBottom: `1px solid ${colors.bg.border}`,
          fontSize: compact ? 20 : 22,
          fontWeight: typography.weights.bold,
          color: colors.text.muted,
        }}
      >
        Live monitor
      </div>
      {rows.map((r, i) => {
        const active = spring({
          frame: Math.max(0, frame - i * 10),
          fps,
          from: 0,
          to: 1,
          config: { damping: 16, stiffness: 200 },
        });
        const highlight = !r.ok;
        return (
          <div
            key={r.label}
            style={{
              padding: '18px 22px',
              borderBottom: i < rows.length - 1 ? `1px solid ${colors.bg.border}` : undefined,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: highlight ? `${colors.accent.amber}14` : 'transparent',
              opacity: active,
              transform: `translateX(${(1 - active) * 12}px)`,
            }}
          >
            <div>
              <div style={{ fontSize: compact ? 24 : 26, color: colors.text.primary, fontWeight: typography.weights.bold }}>
                {r.label}
              </div>
              <div
                style={{
                  fontSize: compact ? 19 : 21,
                  fontWeight: typography.weights.semibold,
                  color: highlight ? colors.accent.amber : colors.text.muted,
                }}
              >
                {r.sub}
              </div>
            </div>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: highlight ? colors.accent.amber : colors.accent.green,
              }}
            />
          </div>
        );
      })}
    </BentoCard>
  );
}

function VisualFairnessMeter({
  frame,
  fps,
  compact,
}: {
  frame: number;
  fps: number;
  compact: boolean;
}) {
  const v = interpolate(frame, [10, 55], [0, 88], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const w = compact ? 320 : 480;
  return (
    <div style={{ width: w, textAlign: 'center' }}>
      <div
        style={{
          fontSize: compact ? 24 : 26,
          fontWeight: typography.weights.bold,
          color: colors.text.muted,
          marginBottom: 14,
        }}
      >
        Sponsorship score
      </div>
      <div
        style={{
          height: compact ? 22 : 28,
          borderRadius: 10,
          background: colors.bg.elevated,
          overflow: 'hidden',
          border: `1px solid ${colors.bg.border}`,
        }}
      >
        <div
          style={{
            width: `${v}%`,
            height: '100%',
            borderRadius: 10,
            background: `linear-gradient(90deg, ${colors.accent.blue}, ${colors.accent.purple})`,
          }}
        />
      </div>
      <div
        style={{
          marginTop: 14,
          fontSize: compact ? 48 : 60,
          fontWeight: typography.weights.extrabold,
          color: colors.accent.purple,
        }}
      >
        {Math.round(v)}% — Approve
      </div>
      <div style={{ marginTop: 10, fontSize: compact ? 22 : 24, fontWeight: typography.weights.bold, color: colors.text.secondary }}>
        Under budget · Allowed action
      </div>
    </div>
  );
}

function VisualRulesChecklist({
  frame,
  fps,
  compact,
}: {
  frame: number;
  fps: number;
  compact: boolean;
}) {
  const items = ['Daily budget OK', 'Action allow-listed', 'Rate limit clear'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 520 }}>
      {items.map((label, i) => {
        const done = frame > 18 + i * 22;
        const check = spring({
          frame: Math.max(0, frame - (20 + i * 22)),
          fps,
          from: 0,
          to: 1,
          config: { damping: 14, stiffness: 220 },
        });
        return (
          <BentoCard key={label} highlight={done} accent={colors.accent.green}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: compact ? 38 : 42,
                  height: compact ? 38 : 42,
                  borderRadius: 8,
                  border: `2px solid ${done ? colors.accent.green : colors.bg.border}`,
                  background: done ? `${colors.accent.green}33` : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  fontWeight: typography.weights.extrabold,
                  color: colors.accent.green,
                  transform: `scale(${done ? check : 0.85})`,
                }}
              >
                {done ? '✓' : ''}
              </div>
              <span style={{ fontSize: compact ? 26 : 28, color: colors.text.primary, fontWeight: typography.weights.bold }}>
                {label}
              </span>
            </div>
          </BentoCard>
        );
      })}
    </div>
  );
}

function VisualPaidStamp({
  frame,
  fps,
  compact,
}: {
  frame: number;
  fps: number;
  compact: boolean;
}) {
  const scale = spring({
    frame: Math.max(0, frame - 6),
    fps,
    from: 1.8,
    to: 1,
    config: { damping: 10, stiffness: 120 },
  });
  const rot = interpolate(frame, [6, 20], [-14, -6], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'relative' }}>
      <BentoCard style={{ padding: compact ? 28 : 40, minWidth: compact ? 260 : 320 }}>
        <div style={{ fontSize: compact ? 22 : 24, fontWeight: typography.weights.bold, color: colors.text.secondary }}>
          Transaction
        </div>
        <div style={{ marginTop: 10, fontSize: compact ? 30 : 36, color: colors.text.primary, fontWeight: typography.weights.extrabold }}>
          Agent completes swap
        </div>
        <div style={{ marginTop: 8, fontSize: compact ? 20 : 22, fontWeight: typography.weights.semibold, color: colors.text.muted }}>
          Fee covered · User sees success
        </div>
      </BentoCard>
      <div
        style={{
          position: 'absolute',
          right: compact ? -6 : 8,
          top: compact ? -16 : -20,
          padding: '12px 22px',
          border: `4px solid ${colors.accent.green}`,
          borderRadius: 8,
          color: colors.accent.green,
          fontWeight: typography.weights.extrabold,
          fontSize: compact ? 36 : 46,
          letterSpacing: 3,
          transform: `rotate(${rot}deg) scale(${scale})`,
          background: `${colors.bg.dark}ee`,
          textTransform: 'uppercase',
        }}
      >
        Paid
      </div>
    </div>
  );
}

function VisualReceiptTrail({
  frame,
  fps,
  compact,
}: {
  frame: number;
  fps: number;
  compact: boolean;
}) {
  const steps = [
    { t: 'Observe', time: '0.0s' },
    { t: 'Decide', time: '0.3s' },
    { t: 'Policy OK', time: '0.4s' },
    { t: 'Sponsor', time: '0.6s' },
    { t: 'Confirmed', time: '1.1s' },
  ];
  return (
    <div style={{ width: '100%', maxWidth: 520 }}>
      {steps.map((s, i) => {
        const show = spring({
          frame: Math.max(0, frame - i * 14),
          fps,
          from: 0,
          to: 1,
          config: { damping: 16, stiffness: 200 },
        });
        return (
          <div
            key={s.t}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: compact ? 10 : 12,
              opacity: show,
              transform: `translateX(${(1 - show) * -16}px)`,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: i === steps.length - 1 ? colors.accent.green : colors.accent.purple,
              }}
            />
            <div style={{ flex: 1, fontSize: compact ? 24 : 26, color: colors.text.primary, fontWeight: typography.weights.bold }}>
              {s.t}
            </div>
            <div
              style={{
                fontSize: compact ? 20 : 22,
                fontWeight: typography.weights.bold,
                color: colors.text.muted,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {s.time}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VisualNetworkStrip({
  frame,
  fps,
  compact,
}: {
  frame: number;
  fps: number;
  compact: boolean;
}) {
  const wave = Math.sin(frame * 0.15) * 8;
  const op = spring({ frame, fps, from: 0, to: 1, config: { damping: 14, stiffness: 160 } });
  return (
    <div style={{ textAlign: 'center', opacity: op }}>
      <div
        style={{
          fontFamily: typography.fontDisplay,
          fontSize: compact ? 72 : 92,
          fontWeight: typography.weights.extrabold,
          background: `linear-gradient(90deg, ${colors.accent.blue}, ${colors.accent.purple})`,
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          transform: `translateY(${wave}px)`,
        }}
      >
        Base
      </div>
      <div style={{ marginTop: 14, fontSize: compact ? 24 : 28, fontWeight: typography.weights.bold, color: colors.text.secondary }}>
        L2 · Low fees · Agent-native workflows
      </div>
      <div
        style={{
          marginTop: 24,
          height: 4,
          width: compact ? 200 : 280,
          marginLeft: 'auto',
          marginRight: 'auto',
          borderRadius: 2,
          background: `linear-gradient(90deg, transparent, ${colors.accent.blue}, ${colors.accent.purple}, transparent)`,
          opacity: 0.8,
        }}
      />
    </div>
  );
}

function VisualHackathonFrame({
  frame,
  fps,
  compact,
}: {
  frame: number;
  fps: number;
  compact: boolean;
}) {
  const s = spring({ frame, fps, from: 0.92, to: 1, config: { damping: 12, stiffness: 140 } });
  return (
    <BentoCard highlight accent={colors.accent.purple} style={{ transform: `scale(${s})`, maxWidth: 620, textAlign: 'center' }}>
      <div style={{ fontSize: compact ? 62 : 72 }}>🏆</div>
      <div style={{ marginTop: 14, fontSize: compact ? 32 : 38, fontWeight: typography.weights.extrabold, color: colors.text.primary }}>
        Your Hackathon Name
      </div>
      <div
        style={{
          marginTop: 12,
          fontSize: compact ? 24 : 26,
          fontWeight: typography.weights.bold,
          color: colors.text.secondary,
          lineHeight: 1.4,
        }}
      >
        Showing judges: agents can move fast without sacrificing safety.
      </div>
    </BentoCard>
  );
}

function VisualDemoTerminal({
  frame,
  fps,
  compact,
}: {
  frame: number;
  fps: number;
  compact: boolean;
}) {
  const lines = [
    '> aegis watch --agent mint-worker',
    'status: LOW_FUEL (est. 11 txs left)',
    '> aegis sponsor --approve',
    'policy: PASS · budget: OK',
    'tx: CONFIRMED ✓',
  ];
  return (
    <BentoCard
      style={{
        width: '100%',
        maxWidth: 640,
        padding: 0,
        overflow: 'hidden',
        fontFamily: typography.fontMono,
        background: '#07080c',
        borderColor: colors.accent.green + '44',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${colors.bg.border}`,
          fontSize: compact ? 18 : 20,
          fontWeight: typography.weights.bold,
          color: colors.text.muted,
        }}
      >
        demo
      </div>
      <div style={{ padding: 16, fontSize: compact ? 22 : 24, fontWeight: typography.weights.semibold, lineHeight: 1.55 }}>
        {lines.map((line, i) => {
          const start = 6 + i * 14;
          const reveal = frame - start;
          const chars = Math.min(line.length, Math.max(0, Math.floor(reveal * 2.5)));
          const visible = reveal > 0;
          const text = line.slice(0, chars);
          const isOk = line.includes('CONFIRMED');
          return (
            <div
              key={i}
              style={{
                color: isOk ? colors.accent.green : colors.accent.cyan,
                minHeight: 30,
                opacity: visible ? 1 : 0.2,
              }}
            >
              {text}
              {visible && chars < line.length ? '▍' : ''}
            </div>
          );
        })}
      </div>
    </BentoCard>
  );
}

function VisualCtaEnd({
  frame,
  fps,
  compact,
}: {
  frame: number;
  fps: number;
  compact: boolean;
}) {
  const pulse = 1 + Math.sin(frame * 0.18) * 0.03;
  const y = spring({ frame, fps, from: 16, to: 0, config: { damping: 14, stiffness: 160 } });
  return (
    <div style={{ textAlign: 'center', transform: `translateY(${y}px) scale(${pulse})` }}>
      <div
        style={{
          fontSize: compact ? 34 : 44,
          fontWeight: typography.weights.extrabold,
          color: colors.accent.cyan,
          wordBreak: 'break-all',
          padding: '0 12px',
        }}
      >
        github.com/your-org/aegis-agent
      </div>
      <div style={{ marginTop: 18, fontSize: compact ? 30 : 36, fontWeight: typography.weights.bold, color: colors.text.secondary }}>
        Thank you
      </div>
    </div>
  );
}

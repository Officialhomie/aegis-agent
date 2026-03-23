import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { colors, typography } from '../theme';
import { BentoCard } from '../marketing/primitives/BentoCard';
import type { BotSlideVariant } from './bot-slides';

type BotSlideVisualProps = {
  variant: BotSlideVariant;
};

export const BotSlideVisual: React.FC<BotSlideVisualProps> = ({ variant }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const isCompact = width < 1920;

  switch (variant) {
    case 'telegramHook':
      return <VisualTelegramHook frame={frame} fps={fps} compact={isCompact} />;
    case 'aegisPowerful':
      return <VisualAegisPowerful frame={frame} fps={fps} compact={isCompact} />;
    case 'fourPains':
      return <VisualFourPains frame={frame} fps={fps} compact={isCompact} />;
    case 'botWordmark':
      return <VisualBotWordmark frame={frame} fps={fps} compact={isCompact} />;
    case 'walletStep':
      return <VisualWalletStep frame={frame} fps={fps} compact={isCompact} />;
    case 'depositStep':
      return <VisualDepositStep frame={frame} fps={fps} compact={isCompact} />;
    case 'budgetStep':
      return <VisualBudgetStep frame={frame} fps={fps} compact={isCompact} />;
    case 'delegationStep':
      return <VisualDelegationStep frame={frame} fps={fps} compact={isCompact} />;
    case 'agentActive':
      return <VisualAgentActive frame={frame} fps={fps} compact={isCompact} />;
    case 'guaranteeCmd':
      return <VisualGuaranteeCmd frame={frame} fps={fps} compact={isCompact} />;
    case 'passportCmd':
      return <VisualPassportCmd frame={frame} fps={fps} compact={isCompact} />;
    case 'costsCmd':
      return <VisualCostsCmd frame={frame} fps={fps} compact={isCompact} />;
    case 'archDiagram':
      return <VisualArchDiagram frame={frame} fps={fps} compact={isCompact} />;
    case 'securityModel':
      return <VisualSecurityModel frame={frame} fps={fps} compact={isCompact} />;
    case 'botCta':
      return <VisualBotCta frame={frame} fps={fps} compact={isCompact} />;
    default:
      return null;
  }
};

function VisualTelegramHook({ frame, fps, compact }: { frame: number; fps: number; compact: boolean }) {
  const bob = Math.sin(frame * 0.12) * 8;
  const pulse = spring({ frame, fps, from: 0.85, to: 1, config: { damping: 12, stiffness: 160 } });
  const ring = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
  const size = compact ? 140 : 180;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 24 : 40 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: `3px solid ${colors.accent.cyan}`,
          background: `${colors.accent.cyan}18`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translateY(${bob}px) scale(${pulse})`,
          boxShadow: `0 0 ${28 + ring * 48}px ${colors.accent.cyan}55`,
          fontSize: compact ? 80 : 100,
        }}
      >
        ✈️
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: compact ? 26 : 30, fontWeight: typography.weights.bold, color: colors.accent.cyan }}>
          Telegram
        </div>
        <div style={{ fontSize: compact ? 22 : 26, fontWeight: typography.weights.semibold, color: colors.text.secondary }}>
          /start → agent in 5 min
        </div>
      </div>
    </div>
  );
}

function VisualAegisPowerful({ frame, fps, compact }: { frame: number; fps: number; compact: boolean }) {
  const left = spring({ frame, fps, from: -30, to: 0, config: { damping: 16, stiffness: 180 } });
  const right = spring({ frame: Math.max(0, frame - 8), fps, from: 30, to: 0, config: { damping: 16, stiffness: 180 } });
  const gap = compact ? 14 : 24;
  return (
    <div style={{ display: 'flex', gap, flexWrap: compact ? 'wrap' : 'nowrap', justifyContent: 'center' }}>
      <div style={{ transform: `translateX(${left}px)`, width: compact ? '100%' : 400 }}>
        <BentoCard accent={colors.accent.purple} highlight>
          <div style={{ fontSize: compact ? 26 : 30, fontWeight: typography.weights.extrabold, color: colors.text.primary }}>
            Aegis API
          </div>
          <div style={{ marginTop: 8, fontSize: compact ? 20 : 22, color: colors.text.secondary, fontWeight: typography.weights.semibold }}>
            Powerful. Autonomous.
          </div>
        </BentoCard>
      </div>
      <div style={{ transform: `translateX(${right}px)`, width: compact ? '100%' : 400 }}>
        <BentoCard accent={colors.accent.rose}>
          <div style={{ fontSize: compact ? 26 : 30, fontWeight: typography.weights.extrabold, color: colors.text.primary }}>
            No UI
          </div>
          <div style={{ marginTop: 8, fontSize: compact ? 20 : 22, color: colors.accent.rose, fontWeight: typography.weights.semibold }}>
            API calls only
          </div>
        </BentoCard>
      </div>
    </div>
  );
}

function VisualFourPains({ frame, fps, compact }: { frame: number; fps: number; compact: boolean }) {
  const pains = [
    { icon: '🔌', label: 'No consumer UI' },
    { icon: '📡', label: 'API knowledge required' },
    { icon: '📱', label: 'No mobile access' },
    { icon: '🔐', label: 'Crypto UX barrier' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: compact ? 12 : 18, maxWidth: 760 }}>
      {pains.map((p, i) => {
        const show = spring({ frame: Math.max(0, frame - i * 12), fps, from: 0, to: 1, config: { damping: 16, stiffness: 200 } });
        return (
          <BentoCard key={p.label} accent={colors.accent.rose} style={{ opacity: show, transform: `scale(${show * 0.15 + 0.85})` }}>
            <div style={{ fontSize: compact ? 36 : 44 }}>{p.icon}</div>
            <div style={{ marginTop: 8, fontSize: compact ? 20 : 22, fontWeight: typography.weights.bold, color: colors.text.primary }}>
              {p.label}
            </div>
          </BentoCard>
        );
      })}
    </div>
  );
}

function VisualBotWordmark({ frame, fps, compact }: { frame: number; fps: number; compact: boolean }) {
  const scale = spring({ frame, fps, from: 0.88, to: 1, config: { damping: 12, stiffness: 140 } });
  const glow = interpolate(frame, [0, 30], [0.3, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{ textAlign: 'center', transform: `scale(${scale})` }}>
      <div
        style={{
          fontFamily: typography.fontDisplay,
          fontSize: compact ? 96 : 130,
          fontWeight: typography.weights.extrabold,
          letterSpacing: -2,
          color: colors.text.primary,
          textShadow: `0 0 ${60 * glow}px rgba(6,182,212,0.6), 0 0 30px rgba(6,182,212,0.35)`,
        }}
      >
        aeg-control
      </div>
      <div style={{ marginTop: compact ? 14 : 20, fontSize: compact ? 26 : 32, color: colors.accent.cyan, fontWeight: typography.weights.bold }}>
        Telegram consumer bot for Aegis
      </div>
    </div>
  );
}

function VisualWalletStep({ frame, fps, compact }: { frame: number; fps: number; compact: boolean }) {
  const show = spring({ frame, fps, from: 0.8, to: 1, config: { damping: 12, stiffness: 140 } });
  return (
    <BentoCard accent={colors.accent.blue} highlight style={{ transform: `scale(${show})`, maxWidth: 560 }}>
      <div style={{ fontSize: compact ? 52 : 64 }}>🛡️</div>
      <div style={{ marginTop: 12, fontSize: compact ? 30 : 36, fontWeight: typography.weights.extrabold, color: colors.text.primary }}>
        Custodial wallet
      </div>
      <div style={{ marginTop: 8, fontSize: compact ? 20 : 22, fontWeight: typography.weights.semibold, color: colors.text.secondary }}>
        AES-256-GCM encrypted
      </div>
      <div style={{ marginTop: 6, fontSize: compact ? 18 : 20, fontWeight: typography.weights.bold, color: colors.accent.blue }}>
        Key never touches logs
      </div>
    </BentoCard>
  );
}

function VisualDepositStep({ frame, fps, compact }: { frame: number; fps: number; compact: boolean }) {
  const pulses = [0, 20, 40].map((offset) =>
    spring({ frame: Math.max(0, frame - offset), fps, from: 0.4, to: 1, config: { damping: 14, stiffness: 200 } }),
  );
  const detected = frame > 60;
  const detectedScale = spring({ frame: Math.max(0, frame - 60), fps, from: 0.6, to: 1, config: { damping: 10, stiffness: 160 } });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 24 : 40 }}>
      <div style={{ position: 'relative', width: compact ? 160 : 200, height: compact ? 160 : 200 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: '50%', top: '50%',
              width: 60 + i * 50, height: 60 + i * 50,
              marginLeft: -(30 + i * 25), marginTop: -(30 + i * 25),
              borderRadius: '50%',
              border: `2px solid ${colors.accent.green}`,
              opacity: 0.3 + pulses[i] * 0.4,
              transform: `scale(${pulses[i]})`,
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: compact ? 44 : 52,
          }}
        >
          💵
        </div>
      </div>
      {detected && (
        <div
          style={{
            transform: `scale(${detectedScale})`,
            fontSize: compact ? 22 : 26,
            fontWeight: typography.weights.extrabold,
            color: colors.accent.green,
          }}
        >
          USDC detected on-chain ✓
        </div>
      )}
    </div>
  );
}

function VisualBudgetStep({ frame, fps, compact }: { frame: number; fps: number; compact: boolean }) {
  const fill = interpolate(frame, [10, 70], [0, 75], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const w = compact ? 300 : 460;
  return (
    <div style={{ width: w, textAlign: 'center' }}>
      <div style={{ fontSize: compact ? 22 : 24, fontWeight: typography.weights.bold, color: colors.text.muted, marginBottom: 12 }}>
        Daily spend limit
      </div>
      <div style={{ height: compact ? 28 : 36, borderRadius: 10, background: colors.bg.elevated, border: `1px solid ${colors.bg.border}`, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${fill}%`,
            borderRadius: 10,
            background: `linear-gradient(90deg, ${colors.accent.amber}, ${colors.accent.green})`,
          }}
        />
      </div>
      <div style={{ marginTop: 12, fontSize: compact ? 44 : 56, fontWeight: typography.weights.extrabold, color: colors.accent.amber }}>
        $50 / day
      </div>
      <div style={{ marginTop: 8, fontSize: compact ? 20 : 22, fontWeight: typography.weights.semibold, color: colors.text.secondary }}>
        Enforced by EIP-712 delegation
      </div>
    </div>
  );
}

function VisualDelegationStep({ frame, fps, compact }: { frame: number; fps: number; compact: boolean }) {
  const lines = [
    '{ "type": "Delegation",',
    '  "verifyingContract": "0x...",',
    '  "budget": "$50.00 / day",',
    '  "sig": "0xAb1c..." }',
  ];
  return (
    <BentoCard
      style={{
        width: '100%', maxWidth: 580, padding: 0, overflow: 'hidden',
        fontFamily: typography.fontMono, background: '#07080c', borderColor: `${colors.accent.purple}44`,
      }}
    >
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${colors.bg.border}`, fontSize: compact ? 18 : 20, fontWeight: typography.weights.bold, color: colors.text.muted }}>
        EIP-712 delegation
      </div>
      <div style={{ padding: 16, fontSize: compact ? 20 : 22, fontWeight: typography.weights.semibold, lineHeight: 1.6 }}>
        {lines.map((line, i) => {
          const start = 8 + i * 14;
          const chars = Math.min(line.length, Math.max(0, Math.floor((frame - start) * 2.5)));
          const visible = frame > start;
          return (
            <div key={i} style={{ color: i === 3 ? colors.accent.purple : colors.accent.cyan, minHeight: 28, opacity: visible ? 1 : 0.2 }}>
              {line.slice(0, chars)}
              {visible && chars < line.length ? '▍' : ''}
            </div>
          );
        })}
      </div>
    </BentoCard>
  );
}

function VisualAgentActive({ frame, fps, compact }: { frame: number; fps: number; compact: boolean }) {
  const msgShow = spring({ frame, fps, from: 0, to: 1, config: { damping: 14, stiffness: 180 } });
  const replyShow = spring({ frame: Math.max(0, frame - 45), fps, from: 0, to: 1, config: { damping: 14, stiffness: 180 } });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
      <div style={{ opacity: msgShow, display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          background: colors.accent.blue, borderRadius: '18px 18px 4px 18px',
          padding: '14px 20px', maxWidth: '80%',
          fontSize: compact ? 22 : 26, fontWeight: typography.weights.semibold, color: '#fff',
        }}>
          Buy 50 USDC of ETH when price dips
        </div>
      </div>
      <div style={{ opacity: replyShow, display: 'flex', justifyContent: 'flex-start' }}>
        <div style={{
          background: colors.bg.card, border: `1px solid ${colors.accent.green}44`,
          borderRadius: '18px 18px 18px 4px',
          padding: '14px 20px', maxWidth: '80%',
          fontSize: compact ? 20 : 23, fontWeight: typography.weights.semibold, color: colors.accent.green,
        }}>
          Executed ✓  · tx: 0x3f...a1 · Gas sponsored by Aegis
        </div>
      </div>
    </div>
  );
}

function VisualGuaranteeCmd({ frame, fps, compact }: { frame: number; fps: number; compact: boolean }) {
  const show = spring({ frame, fps, from: 0, to: 1, config: { damping: 14, stiffness: 180 } });
  const items = ['Contracts: USDC, WETH', 'Functions: swap, transfer', 'Max per tx: $5.00', 'Daily cap: $50.00'];
  return (
    <BentoCard accent={colors.accent.purple} style={{ maxWidth: 520, opacity: show }}>
      <div style={{ fontFamily: typography.fontMono, fontSize: compact ? 30 : 36, fontWeight: typography.weights.extrabold, color: colors.accent.purple, marginBottom: 16 }}>
        /guarantee
      </div>
      {items.map((item, i) => {
        const itemShow = spring({ frame: Math.max(0, frame - 10 - i * 14), fps, from: 0, to: 1, config: { damping: 16, stiffness: 200 } });
        return (
          <div key={item} style={{ fontSize: compact ? 20 : 22, fontWeight: typography.weights.semibold, color: colors.text.secondary, marginBottom: 8, opacity: itemShow, transform: `translateX(${(1 - itemShow) * -10}px)` }}>
            · {item}
          </div>
        );
      })}
    </BentoCard>
  );
}

function VisualPassportCmd({ frame, fps, compact }: { frame: number; fps: number; compact: boolean }) {
  const show = spring({ frame, fps, from: 0.8, to: 1, config: { damping: 12, stiffness: 140 } });
  return (
    <BentoCard accent={colors.accent.blue} highlight style={{ transform: `scale(${show})`, maxWidth: 520 }}>
      <div style={{ fontFamily: typography.fontMono, fontSize: compact ? 28 : 34, fontWeight: typography.weights.extrabold, color: colors.accent.blue, marginBottom: 14 }}>
        /passport
      </div>
      <div style={{ fontSize: compact ? 18 : 20, fontWeight: typography.weights.semibold, color: colors.text.secondary, lineHeight: 1.7 }}>
        Wallet: 0xAbCd...1234{'\n'}
        Tier: TRUSTED{'\n'}
        Passport score: 82{'\n'}
        Active since: 2026-03-22
      </div>
    </BentoCard>
  );
}

function VisualCostsCmd({ frame, fps, compact }: { frame: number; fps: number; compact: boolean }) {
  const fill = interpolate(frame, [10, 60], [0, 24.8], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const w = compact ? 300 : 460;
  return (
    <div style={{ width: w }}>
      <div style={{ fontFamily: typography.fontMono, fontSize: compact ? 28 : 32, fontWeight: typography.weights.extrabold, color: colors.accent.amber, marginBottom: 16 }}>
        /costs
      </div>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', fontSize: compact ? 18 : 20, fontWeight: typography.weights.bold, color: colors.text.secondary }}>
        <span>Spent today</span>
        <span>$12.40 / $50.00</span>
      </div>
      <div style={{ height: compact ? 22 : 28, borderRadius: 8, background: colors.bg.elevated, overflow: 'hidden', border: `1px solid ${colors.bg.border}` }}>
        <div style={{ height: '100%', width: `${fill}%`, borderRadius: 8, background: `linear-gradient(90deg, ${colors.accent.amber}, ${colors.accent.green})` }} />
      </div>
      <div style={{ marginTop: 10, fontSize: compact ? 38 : 48, fontWeight: typography.weights.extrabold, color: colors.accent.amber }}>
        {fill.toFixed(1)}% burn rate
      </div>
    </div>
  );
}

function VisualArchDiagram({ frame, fps, compact }: { frame: number; fps: number; compact: boolean }) {
  const boxes = [
    { label: 'grammy', sub: 'Telegram updates', color: colors.accent.cyan, delay: 0 },
    { label: 'viem', sub: 'On-chain reads', color: colors.accent.blue, delay: 12 },
    { label: 'Hono', sub: 'Callback server', color: colors.accent.amber, delay: 24 },
    { label: 'Redis', sub: 'Session + wallets', color: colors.accent.rose, delay: 36 },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: compact ? 14 : 20, maxWidth: 640 }}>
      {boxes.map((b) => {
        const show = spring({ frame: Math.max(0, frame - b.delay), fps, from: 0, to: 1, config: { damping: 14, stiffness: 200 } });
        return (
          <BentoCard key={b.label} accent={b.color} style={{ opacity: show, transform: `scale(${show * 0.1 + 0.9})` }}>
            <div style={{ fontSize: compact ? 26 : 30, fontWeight: typography.weights.extrabold, color: b.color }}>{b.label}</div>
            <div style={{ marginTop: 6, fontSize: compact ? 18 : 20, fontWeight: typography.weights.semibold, color: colors.text.secondary }}>{b.sub}</div>
          </BentoCard>
        );
      })}
    </div>
  );
}

function VisualSecurityModel({ frame, fps, compact }: { frame: number; fps: number; compact: boolean }) {
  const items = [
    'AES-256-GCM encrypted private key',
    'Key never written to logs',
    'Destructive commands need confirmation',
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 540 }}>
      {items.map((label, i) => {
        const done = frame > 18 + i * 22;
        const check = spring({ frame: Math.max(0, frame - (20 + i * 22)), fps, from: 0, to: 1, config: { damping: 14, stiffness: 220 } });
        return (
          <BentoCard key={label} highlight={done} accent={colors.accent.green}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: compact ? 36 : 40, height: compact ? 36 : 40,
                  borderRadius: 8,
                  border: `2px solid ${done ? colors.accent.green : colors.bg.border}`,
                  background: done ? `${colors.accent.green}33` : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: typography.weights.extrabold, color: colors.accent.green,
                  transform: `scale(${done ? check : 0.85})`,
                }}
              >
                {done ? '✓' : ''}
              </div>
              <span style={{ fontSize: compact ? 22 : 24, color: colors.text.primary, fontWeight: typography.weights.bold }}>
                {label}
              </span>
            </div>
          </BentoCard>
        );
      })}
    </div>
  );
}

function VisualBotCta({ frame, fps, compact }: { frame: number; fps: number; compact: boolean }) {
  const pulse = 1 + Math.sin(frame * 0.18) * 0.03;
  const y = spring({ frame, fps, from: 16, to: 0, config: { damping: 14, stiffness: 160 } });
  return (
    <div style={{ textAlign: 'center', transform: `translateY(${y}px) scale(${pulse})` }}>
      <div style={{ fontSize: compact ? 30 : 40, fontWeight: typography.weights.extrabold, color: colors.accent.cyan, wordBreak: 'break-all', padding: '0 12px' }}>
        github.com/Officialhomie/aeg-control
      </div>
      <div style={{ marginTop: 16, fontSize: compact ? 26 : 32, fontWeight: typography.weights.bold, color: colors.text.secondary }}>
        Open source · MIT · Deploy in 5 min
      </div>
    </div>
  );
}

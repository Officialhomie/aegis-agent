import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { colors, typography } from '../theme';

export const BotHookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = spring({ frame, fps, from: 60, to: 0, config: { damping: 14, stiffness: 100 } });
  const titleScale = spring({ frame, fps, from: 0.92, to: 1, config: { damping: 12, stiffness: 80 } });
  const subtitleOpacity = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: 'clamp' });
  const subtitleY = spring({ frame: Math.max(0, frame - 30), fps, from: 24, to: 0, config: { damping: 14 } });
  const badgeOpacity = interpolate(frame, [60, 90], [0, 1], { extrapolateRight: 'clamp' });
  const badgeScale = spring({ frame: Math.max(0, frame - 60), fps, from: 0.8, to: 1, config: { damping: 12 } });

  // Telegram-style icon pulse
  const iconBob = Math.sin(frame * 0.1) * 8;
  const iconOpacity = interpolate(frame, [20, 50], [0, 1], { extrapolateRight: 'clamp' });

  // Ambient orb — cyan for aeg-control (distinct from Aegis purple)
  const orbScale = 1 + Math.sin(frame * 0.08) * 0.08;
  const orbOpacity = interpolate(frame, [0, 60], [0, 0.5], { extrapolateRight: 'clamp' });

  const fadeOut = interpolate(frame, [400, 449], [1, 0], {
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
      {/* Gradient mesh background */}
      <div style={{ position: 'absolute', inset: 0, background: colors.gradient.mesh }} />

      {/* Cyan radial glow (bot brand color) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(6, 182, 212, 0.2) 0%, transparent 70%)',
        }}
      />

      {/* Animated ambient orb */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '35%',
          width: 600,
          height: 600,
          marginLeft: -300,
          marginTop: -300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.35) 0%, transparent 70%)',
          transform: `scale(${orbScale})`,
          opacity: orbOpacity,
          filter: 'blur(60px)',
        }}
      />

      {/* Subtle grid overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          opacity: 0.5,
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
          textAlign: 'center',
          gap: 0,
        }}
      >
        {/* Telegram icon floating above title */}
        <div
          style={{
            fontSize: 72,
            transform: `translateY(${iconBob}px)`,
            opacity: iconOpacity,
            marginBottom: 24,
          }}
        >
          ✈️
        </div>

        {/* Main title */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px) scale(${titleScale})`,
          }}
        >
          <div
            style={{
              fontFamily: typography.fontDisplay,
              fontSize: typography.sizes.hero,
              fontWeight: typography.weights.extrabold,
              color: colors.text.primary,
              letterSpacing: -3,
              textShadow: `0 0 80px rgba(6, 182, 212, 0.5), 0 0 40px rgba(6, 182, 212, 0.3)`,
            }}
          >
            aeg-control
          </div>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontFamily: typography.fontBody,
            fontSize: typography.sizes.h3,
            fontWeight: typography.weights.medium,
            color: colors.accent.cyan,
            marginTop: 28,
            opacity: subtitleOpacity,
            transform: `translateY(${subtitleY}px)`,
            letterSpacing: -0.5,
          }}
        >
          Your AI agent. In your pocket.
        </div>

        {/* Badge */}
        <div
          style={{
            marginTop: 48,
            padding: '14px 36px',
            borderRadius: 100,
            border: `2px solid rgba(6, 182, 212, 0.4)`,
            background: 'rgba(6, 182, 212, 0.08)',
            backdropFilter: 'blur(12px)',
            fontSize: typography.sizes.caption,
            fontWeight: typography.weights.semibold,
            color: colors.accent.cyan,
            letterSpacing: 2,
            textTransform: 'uppercase',
            opacity: badgeOpacity,
            transform: `scale(${badgeScale})`,
          }}
        >
          Telegram Consumer Bot for Aegis
        </div>
      </div>
    </AbsoluteFill>
  );
};

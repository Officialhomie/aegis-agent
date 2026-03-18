import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { colors, typography } from '../theme';

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = spring({ frame, fps, from: 60, to: 0, config: { damping: 14, stiffness: 100 } });
  const titleScale = spring({ frame, fps, from: 0.92, to: 1, config: { damping: 12, stiffness: 80 } });
  const subtitleOpacity = interpolate(frame, [25, 55], [0, 1], { extrapolateRight: 'clamp' });
  const subtitleY = spring({ frame: Math.max(0, frame - 25), fps, from: 24, to: 0, config: { damping: 14 } });
  const badgeOpacity = interpolate(frame, [55, 85], [0, 1], { extrapolateRight: 'clamp' });
  const badgeScale = spring({ frame: Math.max(0, frame - 55), fps, from: 0.8, to: 1, config: { damping: 12 } });

  // Ambient orb pulse
  const orbScale = 1 + Math.sin(frame * 0.08) * 0.08;
  const orbOpacity = interpolate(frame, [0, 60], [0, 0.6], { extrapolateRight: 'clamp' });

  // Fade out at end
  const fadeOut = interpolate(frame, [400, 449], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg.dark,
        opacity: fadeOut,
        overflow: 'hidden',
      }}
    >
      {/* Gradient mesh background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: colors.gradient.mesh,
        }}
      />

      {/* Radial purple glow from top */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: colors.gradient.purpleGlow,
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
          background: `radial-gradient(circle, ${colors.accent.purpleGlow} 0%, transparent 70%)`,
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
        }}
      >
        {/* Main title with glow */}
        <div
          style={{
            position: 'relative',
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
              letterSpacing: -4,
              textShadow: `0 0 80px ${colors.accent.purpleGlow}, 0 0 40px rgba(168, 85, 247, 0.3)`,
            }}
          >
            AEGIS
          </div>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontFamily: typography.fontBody,
            fontSize: typography.sizes.h3,
            fontWeight: typography.weights.medium,
            color: colors.accent.purple,
            marginTop: 28,
            opacity: subtitleOpacity,
            transform: `translateY(${subtitleY}px)`,
            letterSpacing: -0.5,
          }}
        >
          The Agent That Pays For Other Agents
        </div>

        {/* Badge */}
        <div
          style={{
            marginTop: 48,
            padding: '14px 36px',
            borderRadius: 100,
            border: `2px solid rgba(168, 85, 247, 0.4)`,
            background: 'rgba(168, 85, 247, 0.08)',
            backdropFilter: 'blur(12px)',
            fontSize: typography.sizes.caption,
            fontWeight: typography.weights.semibold,
            color: colors.accent.purple,
            letterSpacing: 2,
            textTransform: 'uppercase',
            opacity: badgeOpacity,
            transform: `scale(${badgeScale})`,
          }}
        >
          Autonomous Gas Sponsorship on Base
        </div>
      </div>
    </AbsoluteFill>
  );
};

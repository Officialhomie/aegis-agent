import { AbsoluteFill } from 'remotion';
import { colors } from '../../theme';

export const GlowBackground: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
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
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
        opacity: 0.45,
      }}
    />
  </AbsoluteFill>
);

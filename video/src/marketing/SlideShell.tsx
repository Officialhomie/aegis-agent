import { AbsoluteFill, useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { colors, typography } from '../theme';
import { GlowBackground } from './primitives/GlowBackground';
import {
  MARKETING_SLIDES,
  MARKETING_TOTAL_FRAMES,
  SLIDE_DURATION_FRAMES,
} from './slides';

type SlideShellProps = {
  slideIndex: number;
  title: string;
  subtitle?: string;
  technicalHint?: string;
  children: React.ReactNode;
};

export const SlideShell: React.FC<SlideShellProps> = ({
  slideIndex,
  title,
  subtitle,
  technicalHint,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const compact = width < 1920;
  const total = MARKETING_SLIDES.length;

  const titleY = spring({
    frame,
    fps,
    from: 28,
    to: 0,
    config: { damping: 18, stiffness: 220 },
  });
  const titleOpacity = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: { damping: 16, stiffness: 200 },
  });
  const subOpacity = spring({
    frame: Math.max(0, frame - 4),
    fps,
    from: 0,
    to: 1,
    config: { damping: 16, stiffness: 180 },
  });

  const globalProgress =
    (slideIndex * SLIDE_DURATION_FRAMES + frame) / MARKETING_TOTAL_FRAMES;

  const titleSize = compact ? 72 : 92;
  const subSize = compact ? 32 : 44;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg.dark,
        fontFamily: typography.fontBody,
        overflow: 'hidden',
      }}
    >
      <GlowBackground />

      <div
        style={{
          position: 'absolute',
          top: compact ? 20 : 28,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          zIndex: 2,
        }}
      >
        <div
          style={{
            padding: '11px 26px',
            borderRadius: 999,
            border: `1px solid ${colors.bg.borderHover}`,
            background: colors.bg.elevated,
            fontSize: compact ? 17 : 19,
            fontWeight: typography.weights.extrabold,
            letterSpacing: 2,
            color: colors.accent.purple,
            textTransform: 'uppercase',
          }}
        >
          Aegis
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: compact ? 82 : 100,
          left: compact ? 28 : 56,
          right: compact ? 28 : 56,
          zIndex: 2,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: typography.fontDisplay,
            fontSize: titleSize,
            fontWeight: typography.weights.extrabold,
            color: colors.text.primary,
            lineHeight: 1.05,
            letterSpacing: -1,
            WebkitFontSmoothing: 'antialiased',
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              marginTop: compact ? 14 : 18,
              fontSize: subSize,
              fontWeight: typography.weights.bold,
              color: colors.text.secondary,
              maxWidth: compact ? 720 : 1120,
              marginLeft: 'auto',
              marginRight: 'auto',
              lineHeight: 1.35,
              opacity: subOpacity,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: 'absolute',
          top: compact ? 278 : 318,
          bottom: compact ? 152 : 168,
          left: compact ? 24 : 48,
          right: compact ? 24 : 48,
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: compact ? 44 : 36,
          left: compact ? 24 : 48,
          right: compact ? 24 : 48,
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginBottom: 10,
            flexWrap: 'wrap',
          }}
        >
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              style={{
                width: compact ? 9 : 10,
                height: compact ? 9 : 10,
                borderRadius: 999,
                background:
                  i <= slideIndex ? colors.accent.purple : colors.bg.border,
                opacity: i === slideIndex ? 1 : i < slideIndex ? 0.85 : 0.35,
                transform: i === slideIndex ? 'scale(1.25)' : 'scale(1)',
                transition: 'none',
              }}
            />
          ))}
        </div>
        <div
          style={{
            height: 5,
            borderRadius: 3,
            background: colors.bg.border,
            overflow: 'hidden',
            marginBottom: technicalHint ? 10 : 0,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${globalProgress * 100}%`,
              borderRadius: 2,
              background: `linear-gradient(90deg, ${colors.accent.purple}, ${colors.accent.cyan})`,
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            marginTop: 6,
          }}
        >
          <span
            style={{
              fontSize: compact ? 18 : 20,
              fontWeight: typography.weights.bold,
              color: colors.text.muted,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {slideIndex + 1} / {total}
          </span>
          {technicalHint ? (
            <span
              style={{
                fontSize: compact ? 16 : 18,
                fontWeight: typography.weights.semibold,
                color: colors.text.muted,
                textAlign: 'right',
                maxWidth: '72%',
                lineHeight: 1.35,
              }}
            >
              {technicalHint}
            </span>
          ) : (
            <span
              style={{
                fontSize: compact ? 18 : 20,
                fontWeight: typography.weights.bold,
                color: colors.text.muted,
              }}
            >
              {Math.round(globalProgress * 100)}%
            </span>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

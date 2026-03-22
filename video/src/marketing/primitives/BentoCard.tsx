import type { CSSProperties, ReactNode } from 'react';
import { colors, typography } from '../../theme';

type BentoCardProps = {
  children: ReactNode;
  accent?: string;
  highlight?: boolean;
  style?: CSSProperties;
};

export const BentoCard: React.FC<BentoCardProps> = ({
  children,
  accent = colors.accent.purple,
  highlight = false,
  style,
}) => (
  <div
    style={{
      borderRadius: 20,
      border: `1px solid ${highlight ? accent : colors.bg.border}`,
      background: highlight
        ? `linear-gradient(135deg, ${accent}22 0%, ${colors.bg.card} 100%)`
        : colors.bg.card,
      padding: 26,
      fontFamily: typography.fontBody,
      boxShadow: highlight ? `0 0 40px ${accent}33` : undefined,
      ...style,
    }}
  >
    {children}
  </div>
);

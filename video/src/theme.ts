/**
 * Aegis Video — Design System
 * Premium dark theme for Twitter, social, and hackathon judging
 */

export const colors = {
  bg: {
    dark: '#050508',
    card: '#0c0c12',
    elevated: '#12121a',
    border: 'rgba(255,255,255,0.06)',
    borderHover: 'rgba(255,255,255,0.12)',
  },
  accent: {
    purple: '#a855f7',
    purpleDim: '#7c3aed',
    purpleGlow: 'rgba(168, 85, 247, 0.4)',
    blue: '#3b82f6',
    cyan: '#06b6d4',
    green: '#10b981',
    amber: '#f59e0b',
    rose: '#f43f5e',
    pink: '#ec4899',
  },
  text: {
    primary: '#f8fafc',
    secondary: '#94a3b8',
    muted: '#64748b',
    inverse: '#0f172a',
  },
  gradient: {
    purpleGlow: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(168, 85, 247, 0.25) 0%, transparent 70%)',
    mesh: 'radial-gradient(at 40% 20%, rgba(168, 85, 247, 0.15) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(59, 130, 246, 0.1) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(16, 185, 129, 0.08) 0px, transparent 50%)',
    card: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
  },
} as const;

export const typography = {
  fontDisplay: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontMono: "'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
  fontBody: "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  sizes: {
    hero: 112,
    h1: 72,
    h2: 56,
    h3: 42,
    body: 24,
    caption: 18,
    small: 14,
  },
  weights: {
    light: 300,
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
} as const;

export const animation = {
  spring: { damping: 14, stiffness: 120 },
  springBouncy: { damping: 10, stiffness: 100 },
  springSnappy: { damping: 20, stiffness: 200 },
} as const;

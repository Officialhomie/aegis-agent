import { cn } from '@/lib/utils';
import { AlertCircle, Info, Lightbulb, AlertTriangle } from 'lucide-react';

type CalloutVariant = 'info' | 'warning' | 'tip' | 'error';

interface CalloutProps {
  variant?: CalloutVariant;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<
  CalloutVariant,
  { bg: string; border: string; icon: React.ComponentType<{ className?: string }>; iconColor: string }
> = {
  info: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    icon: Info,
    iconColor: 'text-cyan-400',
  },
  warning: {
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    icon: AlertTriangle,
    iconColor: 'text-warning',
  },
  tip: {
    bg: 'bg-success/10',
    border: 'border-success/30',
    icon: Lightbulb,
    iconColor: 'text-success',
  },
  error: {
    bg: 'bg-error/10',
    border: 'border-error/30',
    icon: AlertCircle,
    iconColor: 'text-error',
  },
};

export function Callout({
  variant = 'info',
  title,
  children,
  className,
}: CalloutProps) {
  const styles = variantStyles[variant];
  const Icon = styles.icon;

  return (
    <div
      className={cn(
        'flex gap-3 p-4 rounded-lg border-l-4',
        styles.bg,
        styles.border,
        className
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', styles.iconColor)} />
      <div className="flex-1 min-w-0">
        {title && (
          <h5 className="font-semibold text-text-primary mb-1">{title}</h5>
        )}
        <div className="text-sm text-text-secondary">{children}</div>
      </div>
    </div>
  );
}

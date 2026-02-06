import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-elevated text-text-secondary',
        primary: 'border-transparent bg-coral-500/20 text-coral-400',
        secondary: 'border-transparent bg-cyan-500/20 text-cyan-400',
        success: 'border-transparent bg-success/20 text-success',
        warning: 'border-transparent bg-warning/20 text-warning',
        error: 'border-transparent bg-error/20 text-error',
        outline: 'border-border text-text-secondary',
        // Tier badges
        bronze: 'border-transparent bg-amber-700/20 text-amber-500',
        silver: 'border-transparent bg-gray-400/20 text-gray-300',
        gold: 'border-transparent bg-yellow-500/20 text-yellow-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

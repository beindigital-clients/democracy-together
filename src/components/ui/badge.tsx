import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// shadcn Badge, thémé (pastilles / tags des 5 axes, statuts).
const badgeVariants = cva(
  'inline-flex items-center rounded-pill border px-3 py-1 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-line bg-surface-2 text-ink-soft',
        accent: 'border-accent-edge bg-accent-tint text-accent-text',
        outline: 'border-line-strong text-ink',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

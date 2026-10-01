import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// shadcn Badge, themed (chips / tags for the 5 themes, statuses).
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
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';
  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };

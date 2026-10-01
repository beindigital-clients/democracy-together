import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// shadcn Button, themed on the Democracy Together tokens.
//
// The structure is shadcn's (variants, sizes, `data-slot`/`data-variant`/
// `data-size`, `asChild`); the colours are the site's. The focus indicator is
// the global 2 px outline (RGAA 10.7), not shadcn's ring: no `outline-none`.
// Sizes go by padding rather than fixed heights, so a label that wraps at
// 200 % zoom grows the button instead of overflowing it.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-[invalid=true]:border-bar-5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-contrast hover:bg-accent-strong',
        destructive: 'bg-bar-5 text-paper hover:opacity-90',
        outline: 'border border-line-strong text-ink hover:bg-surface-2',
        secondary: 'bg-surface-2 text-ink hover:bg-line',
        ghost: 'text-accent-text hover:bg-accent-tint',
        // Neutral and frameless: the icon buttons of headers and toolbars
        // (search, theme, menus, message actions). A menu trigger keeps the
        // hover look while its menu is open.
        subtle:
          'text-ink-soft hover:bg-surface-2 hover:text-ink data-[state=open]:bg-surface-2 data-[state=open]:text-ink',
        link: 'text-accent-text underline-offset-4 hover:underline',
      },
      size: {
        default: 'px-4 py-2.5 has-[>svg]:px-3',
        xs: 'gap-1 px-2 py-1 text-xs has-[>svg]:px-1.5',
        sm: 'px-3 py-2 text-xs has-[>svg]:px-2.5',
        lg: 'px-6 py-3 has-[>svg]:px-4',
        icon: 'size-10 p-0',
        'icon-xs': 'size-6 p-0',
        'icon-sm': 'size-8 p-0',
        // 36 px: the icons of the site header.
        'icon-md': 'size-9 p-0',
        // 44 px: the touch target of the site's toolbars (WCAG 2.5.5).
        'icon-lg': 'size-11 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

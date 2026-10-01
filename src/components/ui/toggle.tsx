'use client';

import * as React from 'react';
import * as TogglePrimitive from '@radix-ui/react-toggle';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// shadcn Toggle (Radix), themed on the Democracy Together tokens.
//
// A two-state button (`aria-pressed`); grouped as a single choice in a
// `ToggleGroup`, it becomes a radio (`aria-checked`). Two looks:
// - `default`: no frame of its own; the group draws one around the choices
//   (a segmented control: "En attente | Toutes", "APA | BibTeX");
// - `outline`: each choice framed, as a chip (statuses with their count,
//   regions, editing languages).
// The chosen one is marked by its fill AND a heavier weight, not by colour
// alone (RGAA 3.1). The focus indicator is the global outline (RGAA 10.7).
const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 data-[state=on]:font-semibold [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'text-ink-soft hover:bg-surface-2 hover:text-ink data-[state=on]:bg-surface-2 data-[state=on]:text-ink',
        outline:
          'border border-line-strong bg-surface text-ink-soft hover:bg-surface-2 hover:text-ink data-[state=on]:border-accent-edge data-[state=on]:bg-accent-tint data-[state=on]:text-accent-text',
      },
      size: {
        // 44 px: the touch target of the site's toolbars (WCAG 2.5.5).
        default: 'min-h-11 min-w-11 px-3',
        sm: 'min-h-8 min-w-8 px-3 text-xs',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };

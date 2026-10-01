import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// shadcn Badge, themed: the site's PILLS that are not controls — themes and
// tags, statuses, counters. The text always says what the colour shows
// (RGAA 3.1). A pill the reader CHOOSES is a control instead:
// `RadioGroupChoice`, `CheckboxChoice`, a `ToggleGroup` item or a filter
// link (`ChoiceLink`).
//
// `variant` is the colour, `size` the shape:
// - `label`: a data label in monospace capitals (statuses, roles, kinds);
// - `count`: a number beside a link or a title (unread messages, items
//   waiting), at least 20 px wide so a single digit stays round.
// The status tones sit on the bar tokens and hold 4.5:1 in both themes;
// `pending` uses `bar-4-ink`, as `bar-4` is too light for small text on the
// light theme.
const badgeVariants = cva(
  'inline-flex w-fit items-center gap-1 rounded-pill border font-medium [&>svg]:pointer-events-none [&>svg]:size-3 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-line bg-surface-2 text-ink-soft',
        accent: 'border-accent-edge bg-accent-tint text-accent-text',
        outline: 'border-line-strong text-ink',
        solid: 'border-transparent bg-accent text-accent-contrast',
        // Over a picture, where the page's surfaces are not behind it.
        overlay: 'border-transparent bg-ink/85 text-paper',
        good: 'border-[color-mix(in_srgb,var(--color-bar-1)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-bar-1)_9%,transparent)] text-bar-1',
        pending:
          'border-[color-mix(in_srgb,var(--color-bar-4)_48%,transparent)] bg-[color-mix(in_srgb,var(--color-bar-4)_10%,transparent)] text-bar-4-ink',
        bad: 'border-[color-mix(in_srgb,var(--color-bar-5)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-bar-5)_9%,transparent)] text-bar-5',
      },
      size: {
        default: 'px-3 py-1 text-xs',
        sm: 'px-2 py-0.5 text-[11px]',
        lg: 'px-3 py-1.5 text-sm',
        label:
          'px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em]',
        count:
          'h-5 min-w-5 justify-center px-1.5 font-mono text-[11px] font-semibold leading-none tabular-nums',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

function Badge({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';
  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants, type BadgeVariant };

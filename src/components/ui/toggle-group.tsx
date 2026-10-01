'use client';

import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { toggleVariants } from '@/components/ui/toggle';

// shadcn ToggleGroup (Radix), themed on the Democracy Together tokens: the
// site's filters and view switchers ("En attente | Toutes", "Ressources |
// Parcours", 7 / 30 / 90 days, the statuses of one's publications).
//
// `type="single"` is a RADIO GROUP to assistive technologies: the group has
// the `radiogroup` role and needs a name (`aria-label` or
// `aria-labelledby`), each choice is a `radio` with `aria-checked`. Radix
// carries the pattern: ONE tab stop, the arrows move between the choices (in
// the writing direction), Space or Enter picks. Radix lets a click on the
// current choice EMPTY a single group; a filter always has a value, so its
// `onValueChange` ignores the empty string.
//
// `variant="default"` draws the frame around the choices (a segmented
// control); `variant="outline"` frames each one (chips), `spacing` setting
// the gap between them.

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants>
>({ size: 'default', variant: 'default' });

function ToggleGroup({
  className,
  variant = 'default',
  size = 'default',
  spacing = variant === 'outline' ? 2 : 1,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & { spacing?: number }) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      style={{ '--gap': spacing } as React.CSSProperties}
      className={cn(
        'group/toggle-group flex w-fit flex-wrap items-center gap-[--spacing(var(--gap))]',
        variant === 'default' &&
          'rounded-md border border-line bg-surface p-0.5',
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        'shrink-0',
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };

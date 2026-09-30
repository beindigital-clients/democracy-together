'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// shadcn Select (Radix), themed on the Democracy Together tokens.
//
// Named `SelectMenu*` so as not to collide with the native `Select` of
// `select.tsx`, which the rest of the site keeps (its forms are driven as
// native selects by the E2E journeys). The member area uses this one: a
// styled listbox that matches the rest of the redesigned screens, with the
// keyboard behaviour Radix carries (arrows, Home/End, typeahead, Escape).
//
// Values must be non-empty strings (a Radix rule): an "all / none" choice is
// given a sentinel value by the caller.

function SelectMenu(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root {...props} />;
}

function SelectMenuValue(
  props: React.ComponentProps<typeof SelectPrimitive.Value>,
) {
  return <SelectPrimitive.Value {...props} />;
}

// Same box as `Input` (height, border that reaches 3:1, focus border), so a
// select lines up with the text fields of the same grid.
function SelectMenuTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'flex min-h-11 w-full items-center justify-between gap-2 rounded-sm border border-line-field bg-surface px-3 py-2 text-start text-sm text-ink transition-colors hover:bg-surface-2 focus-visible:border-accent-text disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted aria-[invalid=true]:border-bar-5 [&>span]:min-w-0 [&>span]:wrap-anywhere',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

// TOP collision padding = the sticky header (64 px) + 16, as for the menus.
const COLLISION_PADDING = { top: 80, right: 16, bottom: 16, left: 16 };

function SelectMenuContent({
  className,
  children,
  position = 'popper',
  collisionPadding = COLLISION_PADDING,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        collisionPadding={collisionPadding}
        sideOffset={position === 'popper' ? 4 : undefined}
        className={cn(
          'relative z-[90] max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-hidden rounded-md border border-line-strong bg-surface text-ink shadow-pop',
          position === 'popper' &&
            'w-full min-w-(--radix-select-trigger-width)',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex h-7 items-center justify-center text-muted">
          <ChevronUp aria-hidden="true" className="h-4 w-4" />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="p-1">
          {children}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex h-7 items-center justify-center text-muted">
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

// Checked option: tick AND weight (RGAA 3.1 — not colour alone).
function SelectMenuItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex min-h-10 w-full cursor-pointer select-none items-center rounded-xs py-2 pe-2 ps-8 text-sm text-ink-soft focus-visible:-outline-offset-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 data-[highlighted]:text-ink data-[state=checked]:font-medium data-[state=checked]:text-accent-text',
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute start-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check aria-hidden="true" className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-line', className)}
      {...props}
    />
  );
}

export {
  SelectMenu,
  SelectMenuValue,
  SelectMenuTrigger,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuSeparator,
};

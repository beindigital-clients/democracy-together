'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// shadcn DropdownMenu (Radix), themed on the Democracy Together tokens.
//
// Radix carries what a hand-made menu must otherwise rewrite — and what
// `locale-switcher.tsx` rewrites in 200 lines: arrows, Home/End, first-letter
// typeahead, Escape returning focus to the trigger, placement that flips at
// the edge of the screen (and on the right side in Arabic).
//
// No `outline-none` on the items (RGAA 10.7): the global focus outline stays
// the keyboard indicator. It is only pulled INWARDS (`-outline-offset-2`),
// otherwise the edge of the panel would clip it. The `data-highlighted`
// background follows the pointer as well as the keyboard.

function DropdownMenu(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>,
) {
  return <DropdownMenuPrimitive.Root {...props} />;
}

function DropdownMenuTrigger(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>,
) {
  return <DropdownMenuPrimitive.Trigger {...props} />;
}

// TOP collision padding = the site's sticky header (64 px) + 16: without it,
// a menu short of room below its button flipped upwards and slid over the
// header — measured on mobile, half of the country list vanished there. The
// menu therefore stays below its button and scrolls within itself.
const COLLISION_PADDING = { top: 80, right: 16, bottom: 16, left: 16 };

// `container`: where the panel is rendered, `<body>` by default. A menu
// living inside another layer that counts what it contains (the mobile
// menu's focus loop, its bounds) is rendered inside its own component instead
// — see `locale-switcher.tsx`.
function DropdownMenuContent({
  className,
  sideOffset = 4,
  collisionPadding = COLLISION_PADDING,
  container,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content> & {
  container?: HTMLElement | null;
}) {
  return (
    <DropdownMenuPrimitive.Portal container={container}>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        // The panel SCROLLS when room runs out (button low on the screen, a
        // long country list). Radix leaves it at `tabindex=-1`, and its items
        // too (roving focus): axe sees a scrollable region unreachable by
        // keyboard (`scrollable-region-focusable`, "serious" — measured, the
        // country list at a 520 px viewport height). The arrows already
        // scrolled it; a focusable panel clears the alert, and Tab is still
        // intercepted by the menu.
        tabIndex={0}
        // `z-[90]`: an open menu is what the person is looking at, so it sits
        // above the header (50), dialogs (60), action feedback (70) and the
        // cookie banner (80) — under the latter, the bottom of a list was out
        // of reach on a first visit. Only the skip link (100) stays above.
        className={cn(
          'z-[90] max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-sm border border-line-strong bg-surface p-1 text-ink shadow-pop',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Group>,
) {
  return <DropdownMenuPrimitive.Group {...props} />;
}

const itemClass =
  'relative flex cursor-default select-none items-center gap-2 rounded-xs px-2 py-2 text-sm text-ink-soft transition-colors focus-visible:-outline-offset-2 data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-surface-2 data-highlighted:text-ink [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(itemClass, className)}
      {...props}
    />
  );
}

function DropdownMenuRadioGroup(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>,
) {
  return <DropdownMenuPrimitive.RadioGroup {...props} />;
}

// Checked item: tick AND accent tint (RGAA 3.1 — not colour alone), like the
// current language in the language switcher.
function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      className={cn(
        itemClass,
        'ps-8 data-[state=checked]:font-medium data-[state=checked]:text-accent-text',
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute start-2 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check aria-hidden="true" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(
        'px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-line', className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
};

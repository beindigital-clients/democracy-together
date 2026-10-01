'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// shadcn Select (Radix), themed on the Democracy Together tokens.
//
// It replaces the themed native `<select>` the site used until now. Radix
// carries the listbox pattern: arrows, Home/End, first-letter typeahead
// (also on the closed button, as a native select does), Escape returning
// focus to the button, a list placed and flipped at the edge of the screen.
// A mouse wheel over the closed button changes nothing — the native select
// did, which once demoted a moderator (see `role-selector.tsx`).
//
// Inside a `<form>`, a `name` makes Radix render a hidden native select that
// carries the value, so `FormData` and GET forms keep working.
//
// Values are non-empty strings (a Radix rule: the empty string means "no
// choice", and shows the placeholder). An "all / none" choice is given a
// sentinel value — `SelectField` (`choice-fields.tsx`) does it for its
// callers.
//
// No `outline-none` anywhere (RGAA 10.7): the global focus outline stays the
// keyboard indicator, pulled inwards on the items so the panel's edge does
// not clip it.

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup(
  props: React.ComponentProps<typeof SelectPrimitive.Group>,
) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue(
  props: React.ComponentProps<typeof SelectPrimitive.Value>,
) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

// `default`: the same box as `Input` (padding, 16 px text, border that
// reaches 3:1), so a select lines up with the text fields of its grid.
// `sm`: inline controls — a sort order above a list, a role in a table row.
//
// A long choice WRAPS rather than being cut off with an ellipsis: a
// publication title or an organisation name must stay readable whole,
// including at 200 % zoom (RGAA 10.4). Between words, and hyphenated in the
// page's language when a word alone is wider than the button.
function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: 'sm' | 'default';
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        'flex w-fit items-center justify-between gap-2 rounded-sm border border-line-field bg-surface px-3 text-start text-ink transition-colors hover:bg-surface-2 focus-visible:border-accent-text disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted aria-[invalid=true]:border-bar-5 data-[size=default]:min-h-11 data-[size=default]:py-2.5 data-[size=sm]:min-h-9 data-[size=sm]:py-1.5 data-[size=sm]:text-sm *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:wrap-break-word *:data-[slot=select-value]:hyphens-auto [&_svg]:pointer-events-none [&_svg]:shrink-0',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown aria-hidden="true" className="size-4 text-muted" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

// TOP collision padding = the site's sticky header (64 px) + 16, as for the
// menus (`dropdown-menu.tsx`): a list short of room below its button would
// otherwise flip upwards and slide under the header.
const COLLISION_PADDING = { top: 80, right: 16, bottom: 16, left: 16 };

// `popper` rather than shadcn's default `item-aligned`: the list opens BELOW
// its button, at least as wide, instead of being laid over it — the same
// placement as the site's menus and the searchable lists, and one that does
// not cover the field's label.
//
// `z-[90]`: an open list is what the person is looking at, so it sits above
// the header (50), dialogs (60), action feedback (70) and the cookie banner
// (80). Only the skip link (100) stays above.
function SelectContent({
  className,
  children,
  position = 'popper',
  collisionPadding = COLLISION_PADDING,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        collisionPadding={collisionPadding}
        sideOffset={position === 'popper' ? 4 : undefined}
        className={cn(
          'relative z-[90] max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-hidden rounded-md border border-line-strong bg-surface text-ink shadow-pop',
          position === 'popper' &&
            'w-full min-w-(--radix-select-trigger-width) max-w-[calc(100vw-2rem)]',
          className,
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport data-slot="select-viewport" className="p-1">
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn(
        'px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted',
        className,
      )}
      {...props}
    />
  );
}

// Checked option: tick AND weight and accent (RGAA 3.1 — not colour alone),
// like the checked items of the menus. The tick sits at the START of the
// line, as in `DropdownMenuRadioItem`.
function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex min-h-10 w-full cursor-pointer select-none items-center gap-2 rounded-xs py-2 pe-2 ps-8 text-sm text-ink-soft focus-visible:-outline-offset-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 data-[highlighted]:text-ink data-[state=checked]:font-medium data-[state=checked]:text-accent-text [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    >
      <span
        data-slot="select-item-indicator"
        className="pointer-events-none absolute start-2 flex size-4 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <Check aria-hidden="true" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-line', className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        'flex h-7 cursor-default items-center justify-center text-muted',
        className,
      )}
      {...props}
    >
      <ChevronUp aria-hidden="true" className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        'flex h-7 cursor-default items-center justify-center text-muted',
        className,
      )}
      {...props}
    >
      <ChevronDown aria-hidden="true" className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};

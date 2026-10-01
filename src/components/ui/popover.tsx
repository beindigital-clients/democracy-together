'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

// shadcn Popover (Radix), themed on the Democracy Together tokens.
//
// Radix carries focus management (into the panel on opening, back to the
// trigger on closing), Escape, outside click and collision-aware placement.
// Same stacking and collision rules as `dropdown-menu.tsx`: above the sticky
// header, never sliding under it.

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root {...props} />;
}

function PopoverTrigger(
  props: React.ComponentProps<typeof PopoverPrimitive.Trigger>,
) {
  return <PopoverPrimitive.Trigger {...props} />;
}

function PopoverAnchor(
  props: React.ComponentProps<typeof PopoverPrimitive.Anchor>,
) {
  return <PopoverPrimitive.Anchor {...props} />;
}

// TOP collision padding = the sticky header (64 px) + 16, as for the menus.
const COLLISION_PADDING = { top: 80, right: 16, bottom: 16, left: 16 };

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 6,
  collisionPadding = COLLISION_PADDING,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'z-[90] rounded-md border border-line-strong bg-surface text-ink shadow-pop',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// shadcn Item, themed on the Democracy Together tokens: the ROWS and CARDS
// of a list — a notification, an activity, an entry of the moderation
// queue, a picture of the media library. With `asChild`, the whole surface
// is the link or button it renders; a selected one (`aria-pressed`) takes
// the accent border and tint.
//
// Three differences from the shadcn source:
// - the focus indicator is the site's global outline (RGAA 10.7), not a
//   ring: no `outline-none`;
// - the parts are SPANS, not `div`/`p`: a button may only hold phrasing
//   content, and a row is often a button (RGAA 8.2, valid code);
// - no `ItemSeparator`: the project has no Radix Separator, and no list
//   needs one.
const itemVariants = cva(
  'group/item flex flex-wrap items-center rounded-md border border-transparent text-start text-sm transition-colors duration-100 [a&]:hover:bg-surface-2 [button&]:hover:bg-surface-2 aria-pressed:border-accent aria-pressed:bg-accent-tint aria-pressed:hover:bg-accent-tint',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline:
          'border-line bg-surface [a&]:hover:border-line-strong [button&]:hover:border-line-strong',
        muted: 'bg-surface-2',
        // Calls for attention (an unread notification): accent tint.
        accent:
          'border-accent-edge bg-accent-tint/60 [a&]:hover:bg-accent-tint [button&]:hover:bg-accent-tint',
      },
      size: {
        default: 'gap-4 p-4',
        sm: 'gap-2.5 px-4 py-3',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Item({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof itemVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'div';
  return (
    <Comp
      data-slot="item"
      data-variant={variant}
      data-size={size}
      className={cn(itemVariants({ variant, size, className }))}
      {...props}
    />
  );
}

function ItemGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="list"
      data-slot="item-group"
      className={cn('group/item-group flex flex-col', className)}
      {...props}
    />
  );
}

const itemMediaVariants = cva(
  'flex shrink-0 items-center justify-center gap-2 group-has-[[data-slot=item-description]]/item:translate-y-0.5 group-has-[[data-slot=item-description]]/item:self-start [&_svg]:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        icon: "size-8 rounded-sm border border-line bg-surface-2 [&_svg:not([class*='size-'])]:size-4",
        image:
          'size-10 overflow-hidden rounded-sm [&_img]:size-full [&_img]:object-cover',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function ItemMedia({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof itemMediaVariants>) {
  return (
    <span
      data-slot="item-media"
      data-variant={variant}
      className={cn(itemMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

function ItemContent({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="item-content"
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-1 [&+[data-slot=item-content]]:flex-none',
        className,
      )}
      {...props}
    />
  );
}

function ItemTitle({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="item-title"
      className={cn(
        'flex w-fit items-center gap-2 text-sm font-medium leading-snug text-ink',
        className,
      )}
      {...props}
    />
  );
}

function ItemDescription({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="item-description"
      className={cn(
        'line-clamp-2 text-sm font-normal leading-normal text-muted [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-accent-text',
        className,
      )}
      {...props}
    />
  );
}

function ItemActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-actions"
      className={cn('flex items-center gap-2', className)}
      {...props}
    />
  );
}

function ItemHeader({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="item-header"
      className={cn(
        'flex basis-full items-center justify-between gap-2',
        className,
      )}
      {...props}
    />
  );
}

function ItemFooter({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="item-footer"
      className={cn(
        'flex basis-full items-center justify-between gap-2',
        className,
      )}
      {...props}
    />
  );
}

export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemTitle,
  itemVariants,
};

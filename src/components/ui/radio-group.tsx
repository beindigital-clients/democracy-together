'use client';

import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cn } from '@/lib/utils';

// shadcn RadioGroup (Radix), themed on the Democracy Together tokens.
//
// Radix carries the radio-group pattern: ONE tab stop for the group, the
// arrows move AND choose (in the writing direction, from the site's
// `DirectionProvider`). Each item goes inside a wrapping `<label>` with its
// text, as for `Checkbox`. A `name` on the group submits the choice with the
// enclosing form.
function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn('grid gap-3', className)}
      {...props}
    />
  );
}

// 20 px, 3:1 border (RGAA 3.3), global focus outline (RGAA 10.7). Checked:
// accent ring AND a filled dot (RGAA 3.1). The dot is centred by the
// indicator's flex box, which holds in both writing directions.
function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'aspect-square size-5 shrink-0 rounded-full border border-line-field bg-surface text-accent transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-bar-5 data-[state=checked]:border-accent',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-full items-center justify-center"
      >
        <span className="block size-2.5 rounded-full bg-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };

'use client';

import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { choiceStyle } from '@/components/ui/choice';

// shadcn RadioGroup (Radix), themed on the Democracy Together tokens.
//
// Radix carries the radio-group pattern: ONE tab stop for the group, the
// arrows move AND choose (in the writing direction, from the site's
// `DirectionProvider`). Each item goes inside a wrapping `<label>` with its
// text, as for `Checkbox`. A `name` on the group submits the choice with the
// enclosing form.
//
// THE ARROW CHOOSES, EVEN ON A SHORT PRESS. Radix moves the focus in a
// timeout and only then checks the radio, and only if the arrow key is STILL
// DOWN at that moment. A quick tap — a screen reader passing the key on, an
// automated test — released it first: the focus moved and the choice did not
// follow, so the radio announced as focused was not the chosen one. The
// group therefore checks, after an arrow, the radio the focus has reached.
const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

function RadioGroup({
  className,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn('grid gap-3', className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!ARROW_KEYS.includes(event.key)) return;
        const group = event.currentTarget;
        // Queued after Radix's own focus move, hence run after it.
        setTimeout(() => {
          const focused = group.ownerDocument.activeElement;
          if (
            focused instanceof HTMLElement &&
            group.contains(focused) &&
            focused.getAttribute('role') === 'radio' &&
            focused.getAttribute('aria-checked') === 'false'
          ) {
            focused.click();
          }
        });
      }}
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

// A choice drawn as a CHIP or a CARD rather than a dot (amounts, currencies,
// an applicant type, an income bracket): the whole surface is the radio — a
// `button` with the `radio` role, named by its text — so it carries the
// global focus outline itself (RGAA 10.7), with no hidden input under a
// drawing. Checked: accent border and tint AND the tick that
// `RadioGroupChoiceIndicator` places where the caller wants it (RGAA 3.1).
// The shape is the caller's: `rounded-pill px-4` for a chip, a column for a
// card with its description. Drawn by `choiceStyle`, shared with
// `CheckboxChoice` and `ChoiceLink`.
function RadioGroupChoice({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-choice"
      className={cn(choiceStyle(), className)}
      {...props}
    />
  );
}

// The tick of a checked `RadioGroupChoice`: rendered only while checked.
function RadioGroupChoiceIndicator({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Indicator>) {
  return (
    <RadioGroupPrimitive.Indicator
      data-slot="radio-group-choice-indicator"
      className={cn('inline-flex shrink-0', className)}
      {...props}
    >
      <Check aria-hidden="true" className="size-3.5" />
    </RadioGroupPrimitive.Indicator>
  );
}

export {
  RadioGroup,
  RadioGroupChoice,
  RadioGroupChoiceIndicator,
  RadioGroupItem,
};

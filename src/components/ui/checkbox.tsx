'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

// shadcn Checkbox (Radix), themed on the Democracy Together tokens.
//
// A `button` with the `checkbox` role: the same box in every browser, where
// the native one followed each system's drawing. Put it inside a wrapping
// `<label>` with its text — the label names it and the whole line toggles it,
// without the `htmlFor` the site's field rule forbids. Inside a `<form>`, a
// `name` makes Radix add a hidden native checkbox, so `FormData` still sees
// it.
//
// 20 px, with the 3:1 field border (RGAA 3.3); the focus indicator is the
// global outline (RGAA 10.7). Checked: accent fill AND a tick (RGAA 3.1).
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer grid size-5 shrink-0 place-content-center rounded-xs border border-line-field bg-surface text-accent-contrast transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-bar-5 data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
      >
        {props.checked === 'indeterminate' ? (
          <Minus aria-hidden="true" className="size-3.5" strokeWidth={3} />
        ) : (
          <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };

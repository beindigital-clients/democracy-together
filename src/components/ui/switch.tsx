'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

// shadcn Switch (Radix), themed on the Democracy Together tokens.
//
// A `button` with the `switch` role: a screen reader says "on"/"off" rather
// than "checked". For an on/off SETTING that applies at once; a choice
// submitted with a form is a `Checkbox`. Inside a wrapping `<label>`, as the
// other choice controls.
//
// The thumb travels toward the END of the line: to the left in Arabic, hence
// the `rtl:` translations. Off: grey track and thumb; on: accent track, light
// thumb — position AND colour (RGAA 3.1).
function Switch({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: 'sm' | 'default';
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch inline-flex shrink-0 items-center rounded-pill border border-line-field bg-surface-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[size=default]:h-6 data-[size=default]:w-10 data-[size=sm]:h-5 data-[size=sm]:w-8',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-muted shadow-card transition-transform data-[state=checked]:bg-accent-contrast group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3.5 data-[state=unchecked]:translate-x-0.5 rtl:data-[state=unchecked]:-translate-x-0.5 group-data-[size=default]/switch:data-[state=checked]:translate-x-5 rtl:group-data-[size=default]/switch:data-[state=checked]:-translate-x-5 group-data-[size=sm]/switch:data-[state=checked]:translate-x-[14px] rtl:group-data-[size=sm]/switch:data-[state=checked]:-translate-x-[14px]"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };

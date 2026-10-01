import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge knows Tailwind's default scales, not the theme's own radius
// key: `rounded-pill` (`--radius-pill`, globals.css) was not recognised as a
// border radius, so `cn('rounded-sm', 'rounded-pill')` kept BOTH and the
// stylesheet's order decided — `rounded-sm` won. A chip or the message
// reaction bar asked to be a pill stayed a rectangle. Colours, shadows and
// fonts of the theme are already resolved by its fallbacks.
const twMerge = extendTailwindMerge({
  extend: { theme: { radius: ['pill'] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

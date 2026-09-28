import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// An area that SCROLLS horizontally, reachable other than with the mouse.
//
// A bare `<div class="overflow-x-auto">` is a reverse trap: the mouse
// scrolls, the keyboard doesn't. What overflows the screen then becomes
// literally unreachable for anyone not using a mouse — and on a
// table, that means entire columns of data (axe
// `scrollable-region-focusable`, WCAG 2.1.1). Measured on /fr/barometre and
// /fr/adhesion on mobile, where the tables overflow; on desktop they fit,
// which is why the defect only showed on small screens.
//
// `tabIndex` makes the area focusable, hence scrollable with the arrow keys. And since
// this creates a tab stop, it needs a NAME: landing on an anonymous
// box is hardly better than not being able to enter it at all. The label
// is therefore REQUIRED, and we pass it the title the section already carries —
// no hard-coded string, no new translation key.
//
// Rendered server-side, without JavaScript: the defect fixed here is precisely
// that of content one cannot reach.
//
// The focus ring comes from the global `:focus-visible` rule in
// globals.css — no need to repeat it here.

export function ScrollableRegion({
  label,
  className,
  children,
}: {
  /** Name announced on entering the area. Usually the table's title. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      // `relative`: an absolutely positioned descendant (an `sr-only`, for
      // example) is placed relative to the FIRST positioned ancestor, and an
      // unpositioned `overflow-x-auto` ancestor does not clip it. Measured on
      // 27/09 on /barometre on mobile: the "Télécharger et citer" table
      // widened the whole document (585 px for 412) through such an element,
      // and the entire page scrolled horizontally.
      className={cn('relative overflow-x-auto', className)}
    >
      {children}
    </div>
  );
}

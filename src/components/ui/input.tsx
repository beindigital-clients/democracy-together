import * as React from 'react';
import { cn } from '@/lib/utils';

// shadcn Input, themed.
//
// No more `outline-none` (RGAA 10.7): it removed the global focus outline
// (`:focus-visible` in `globals.css`) and left only a 1 px border that
// changes shade — measured in the 27/09 audit, it was the only indicator for
// all the site's fields. The 2 px outline is back; the dark border stays
// as a complement. Same fix on `Textarea` and `Select`.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'w-full rounded-sm border border-line-field bg-surface px-3 py-2.5 text-ink transition-colors placeholder:text-muted focus-visible:border-accent-text disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };

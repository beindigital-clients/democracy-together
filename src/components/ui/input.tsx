import * as React from 'react';
import { cn } from '@/lib/utils';

// shadcn Input, thémé.
//
// Plus d'`outline-none` (RGAA 10.7) : il retirait le contour de focus global
// (`:focus-visible` de `globals.css`) et ne laissait qu'une bordure de 1 px qui
// change de teinte — mesuré à l'audit du 27/09, c'était le seul indicateur de
// tous les champs du site. Le contour de 2 px revient ; la bordure foncée reste
// en complément. Même correction sur `Textarea` et `Select`.
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

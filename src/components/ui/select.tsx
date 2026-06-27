import * as React from 'react';
import { cn } from '@/lib/utils';

// Select natif thémé (léger, accessible, testable). Pas de Radix : cohérent
// avec l'objectif faible débit.
function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'rounded-sm border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none transition-colors focus-visible:border-accent-text disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Select };

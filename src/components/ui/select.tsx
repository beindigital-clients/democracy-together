import * as React from 'react';
import { cn } from '@/lib/utils';

// Themed native select (lightweight, accessible, testable). No Radix: consistent
// with the low-bandwidth goal.
function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'rounded-sm border border-line-field bg-surface px-2.5 py-1.5 text-sm text-ink transition-colors focus-visible:border-accent-text disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Select };

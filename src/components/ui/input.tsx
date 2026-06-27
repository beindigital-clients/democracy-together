import * as React from 'react';
import { cn } from '@/lib/utils';

// shadcn Input, thémé.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'w-full rounded-sm border border-line bg-surface px-3 py-2.5 text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-accent-text disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };

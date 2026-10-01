import * as React from 'react';
import { cn } from '@/lib/utils';

// shadcn Textarea, themed (consistent with ui/input: global focus outline,
// error colour on the border of an invalid field).
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'w-full rounded-sm border border-line-field bg-surface px-3 py-2.5 text-ink transition-colors placeholder:text-muted focus-visible:border-accent-text disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-bar-5',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// shadcn NativeSelect, themed on the Democracy Together tokens.
//
// For the ONE case the Radix `Select` cannot serve: a page without
// JavaScript. The directory's facets fall back to a `<noscript>` form of
// these (see `directory-filters.tsx`); everywhere else, use `Select`.
// Same box as `Input` and `SelectTrigger`, its own chevron (the browser's
// arrow is removed with `appearance-none`), placed at the END of the line so
// it follows the writing direction.
function NativeSelect({
  className,
  size = 'default',
  ...props
}: Omit<React.ComponentProps<'select'>, 'size'> & { size?: 'sm' | 'default' }) {
  return (
    <div
      data-slot="native-select-wrapper"
      className="group/native-select relative w-fit has-[select:disabled]:opacity-50"
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          'w-full min-w-0 appearance-none rounded-sm border border-line-field bg-surface ps-3 pe-9 text-ink transition-colors focus-visible:border-accent-text disabled:pointer-events-none disabled:cursor-not-allowed aria-[invalid=true]:border-bar-5 data-[size=default]:min-h-11 data-[size=default]:py-2.5 data-[size=sm]:min-h-9 data-[size=sm]:py-1.5 data-[size=sm]:text-sm',
          className,
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        data-slot="native-select-icon"
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 select-none text-muted"
      />
    </div>
  );
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<'option'>) {
  return (
    <option
      data-slot="native-select-option"
      className={cn('bg-surface text-ink', className)}
      {...props}
    />
  );
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<'optgroup'>) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn('bg-surface text-ink', className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };

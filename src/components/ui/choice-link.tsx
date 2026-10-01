import type * as React from 'react';
import { Check } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { choiceStyle } from '@/components/ui/choice';
import { cn } from '@/lib/utils';

// A filter chip that is a LINK: a GET address, so the filter works without
// JavaScript and can be shared. Drawn like `RadioGroupChoice`; the active
// one carries `aria-current` and the same tick (RGAA 3.1). `data-state`
// only feeds the shared drawing.
function ChoiceLink({
  active,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Link> & { active: boolean }) {
  return (
    <Link
      data-slot="choice-link"
      data-state={active ? 'checked' : 'unchecked'}
      aria-current={active ? 'true' : undefined}
      className={cn(choiceStyle(), 'rounded-pill px-3.5 py-1.5', className)}
      {...props}
    >
      {active ? (
        <Check aria-hidden="true" className="size-3.5 shrink-0" />
      ) : null}
      {children}
    </Link>
  );
}

export { ChoiceLink };

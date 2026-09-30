import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { ArrowForward } from '@/components/ui/arrow';
import { cn } from '@/lib/utils';

// Building blocks shared by the dashboard's blocks: a titled card, and the
// "see everything" link at the top of a card.

export function DashCard({
  titleId,
  title,
  icon: Icon,
  action,
  lead,
  className,
  children,
}: {
  titleId: string;
  title: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  lead?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'rounded-md border border-line bg-surface p-5 shadow-card sm:p-6',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          {Icon ? (
            <span
              aria-hidden="true"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-accent-tint text-accent-text"
            >
              <Icon className="h-[18px] w-[18px]" />
            </span>
          ) : null}
          <h2
            id={titleId}
            className="wrap-anywhere font-display text-[21px] leading-tight text-ink"
          >
            {title}
          </h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {lead ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{lead}</p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function CardLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent-text hover:underline"
    >
      {children} <ArrowForward />
    </Link>
  );
}

// Error frame of a block that could not load (see `WidgetBoundary`).
export function DashCardError({ message }: { message: string }) {
  return (
    <p
      role="status"
      className="rounded-md border border-dashed border-line-strong bg-surface p-5 text-sm text-ink-soft"
    >
      {message}
    </p>
  );
}

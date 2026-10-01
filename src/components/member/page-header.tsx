import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Header of a member-area screen: title, one-sentence standfirst, and the
// screen's own actions on the opposite side.
//
// No breadcrumb and no "← Espace membre" link any more: the side column (or
// the folded menu on small screens) already says where one is and how to
// get back. Each screen used to carry its own variant of that link — four
// different styles for the same gesture.
//
// Without hooks, so a server page can render it as well as a client screen.
export function MemberPageHeader({
  title,
  lead,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode;
  lead?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-6',
        className,
      )}
    >
      <div className="min-w-0 max-w-[68ch] flex-1 basis-[20rem]">
        {eyebrow ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 wrap-anywhere font-display text-[clamp(28px,3.2vw,38px)] font-medium leading-[1.1] tracking-[-0.015em] text-ink">
          {title}
        </h1>
        {lead ? (
          <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
            {lead}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

// Body of a member-area screen under its header. `narrow` keeps forms and
// long reading at a comfortable line length inside the wide column.
export function MemberPageBody({
  narrow = false,
  className,
  children,
}: {
  narrow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('mt-8', narrow && 'max-w-3xl', className)}>
      {children}
    </div>
  );
}

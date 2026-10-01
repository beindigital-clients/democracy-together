'use client';

import { useCallback, useId, type ReactNode } from 'react';
import { ConvexError } from 'convex/values';
import { useLocale, useTranslations } from 'next-intl';
import { intlLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';
import { cn } from '@/lib/utils';
import { MemberPageHeader as SharedMemberPageHeader } from '@/components/member/page-header';
import { Checkbox } from '@/components/ui/checkbox';

// Shared building blocks for the "programmes" screens (F-56 to F-60): translated
// server rejections, checkbox group, dates.

// Code of a server rejection: `ConvexError('CODE')` travels through to the client
// with its data; role guards throw in French, recognized by their text.
export function programmeErrorCode(err: unknown): string {
  if (err instanceof ConvexError && typeof err.data === 'string')
    return err.data;
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/Accès refusé/.test(message)) return 'FORBIDDEN';
  if (/Non authentifié/.test(message)) return 'UNAUTHENTICATED';
  const m = /\b([A-Z][A-Z_]{3,})\b/.exec(message);
  return m ? m[1] : 'GENERIC';
}

// The label of a rejection: `errors.programme_<CODE>`, with the generic one as fallback —
// a code added server-side without its label is never shown raw.
export function useProgrammeError(): (err: unknown) => string {
  const t = useTranslations('errors');
  return useCallback(
    (err: unknown) =>
      vocabulary(
        t,
        'programme_',
        programmeErrorCode(err),
        t('programmeGeneric'),
      ),
    [t],
  );
}

export function useDateFormat() {
  const locale = useLocale();
  return useCallback(
    (ms: number, opts: { time?: boolean; timeZone?: string } = {}): string =>
      new Intl.DateTimeFormat(intlLocale(locale), {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        ...(opts.time ? { hour: '2-digit', minute: '2-digit' } : {}),
        ...(opts.timeZone
          ? { timeZone: opts.timeZone, timeZoneName: 'short' }
          : {}),
      }).format(ms),
    [locale],
  );
}

// Checkbox group: `fieldset` + `legend`, each checkbox is a 44 px target.
export function CheckGroup({
  legend,
  options,
  value,
  onChange,
  error,
  className,
}: {
  legend: ReactNode;
  options: readonly { value: string; label: string }[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  error?: string | null;
  className?: string;
}) {
  const errorId = useId();
  return (
    <fieldset
      className={cn('min-w-0', className)}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="text-sm text-ink-soft">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((o) => {
          const checked = value.includes(o.value);
          return (
            <label
              key={o.value}
              className={cn(
                'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill border px-3 text-sm',
                checked
                  ? 'border-accent-edge bg-accent-tint text-accent-text'
                  : 'border-line bg-surface text-ink-soft hover:border-line-strong',
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true
                      ? [...value, o.value]
                      : value.filter((x) => x !== o.value),
                  )
                }
              />
              {o.label}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="mt-1 text-sm text-bar-5">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

// Status badge, using the theme tokens (contrast held in light and
// dark mode by the bar colours, like the "Mes contributions" table).
const TONES = {
  neutral: 'border-line-strong bg-surface-2 text-muted',
  pending:
    'border-[color-mix(in_srgb,var(--color-bar-4)_48%,transparent)] bg-[color-mix(in_srgb,var(--color-bar-4)_10%,transparent)] text-bar-4',
  good: 'border-[color-mix(in_srgb,var(--color-bar-1)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-bar-1)_9%,transparent)] text-bar-1',
  bad: 'border-[color-mix(in_srgb,var(--color-bar-5)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-bar-5)_9%,transparent)] text-bar-5',
} as const;

export function StatusPill({
  tone,
  children,
}: {
  tone: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap rounded-pill border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.06em]',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof TONES {
  if (['approved', 'selected', 'active', 'published', 'done'].includes(status))
    return 'good';
  if (['rejected', 'declined', 'withdrawn'].includes(status)) return 'bad';
  if (
    ['pending', 'proposed', 'submitted', 'waitlisted', 'paused'].includes(
      status,
    )
  )
    return 'pending';
  return 'neutral';
}

export const CARD = 'rounded-md border border-line bg-surface p-5';
// Width of a programme screen INSIDE the member-area shell, which already
// provides the page margins and the navigation: only the reading width is
// set here.
export const PAGE = 'max-w-3xl';

// Header of a member-area screen: the shared one (title, standfirst), under
// the name the programme screens have always imported. The breadcrumb it
// used to draw is gone: the member-area navigation says where one is.
export function MemberPageHeader({
  title,
  lead,
}: {
  title: string;
  lead?: string;
}) {
  return <SharedMemberPageHeader title={title} lead={lead} />;
}

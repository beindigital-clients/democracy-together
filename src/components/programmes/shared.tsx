'use client';

import { useCallback, useId, type ReactNode } from 'react';
import { ConvexError } from 'convex/values';
import { useLocale, useTranslations } from 'next-intl';
import { intlLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/navigation';

// Briques partagées des écrans « programmes » (F-56 à F-60) : refus serveur
// traduits, groupe de cases à cocher, dates.

// Code d'un refus serveur : `ConvexError('CODE')` traverse jusqu'au client
// avec sa donnée ; les gardes de rôle lèvent en français, reconnues au texte.
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

// Le libellé d'un refus : `errors.programme_<CODE>`, le générique en repli —
// un code ajouté côté serveur sans son libellé ne s'affiche jamais brut.
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

// Groupe de cases : `fieldset` + `legend`, chaque case est une cible de 44 px.
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
              <input
                type="checkbox"
                className="h-4 w-4 accent-accent"
                checked={checked}
                onChange={(e) =>
                  onChange(
                    e.target.checked
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

// Pastille de statut, sur les jetons du thème (contraste tenu en clair et en
// sombre par les couleurs de barre, comme le tableau « Mes contributions »).
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
export const PAGE = 'mx-auto max-w-3xl px-4 py-12 sm:px-6';

// En-tête d'un écran de l'espace membre : fil d'Ariane, titre, chapeau.
export function MemberPageHeader({
  title,
  lead,
}: {
  title: string;
  lead?: string;
}) {
  const t = useTranslations('library');
  return (
    <header>
      <p className="text-[13px] text-muted">
        <Link href="/" className="text-muted hover:text-ink">
          {t('breadcrumbHome')}
        </Link>{' '}
        /{' '}
        <Link href="/espace-membre" className="text-muted hover:text-ink">
          {t('submit.memberSpace')}
        </Link>{' '}
        / {title}
      </p>
      <h1 className="mt-4 wrap-anywhere font-display text-[clamp(28px,3.4vw,40px)] font-medium leading-tight tracking-[-0.015em]">
        {title}
      </h1>
      {lead ? (
        <p className="mt-3 max-w-[60ch] text-lg leading-relaxed text-ink-soft">
          {lead}
        </p>
      ) : null}
    </header>
  );
}

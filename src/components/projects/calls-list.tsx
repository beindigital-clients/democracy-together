'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { callWindowState } from '@convex/lib/programmes';
import { Link } from '@/i18n/navigation';
import { intlLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';
import { StatusPill, useDateFormat } from '@/components/programmes/shared';

export type PublicCall = FunctionReturnType<
  typeof api.projectCalls.listPublicCalls
>[number];

export function useFundFormat() {
  const locale = useLocale();
  return (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat(intlLocale(locale), {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  };
}

// "Opening / closing" line in the call's time zone, which is the
// authoritative time (a call launched from Dakar closes at 6 pm Dakar time).
export function CallWindowLine({
  call,
  now,
}: {
  call: PublicCall;
  now: number;
}) {
  const t = useTranslations('projects');
  const fmt = useDateFormat();
  const state = callWindowState(call, now);
  const opts = { time: true, timeZone: call.timeZone };
  return (
    <p className="text-[14px] text-ink-soft">
      {state === 'upcoming'
        ? t('callOpensOn', { date: fmt(call.opensAt, opts) })
        : state === 'open'
          ? t('callClosesOn', { date: fmt(call.closesAt, opts) })
          : t('callClosedOn', { date: fmt(call.closesAt, opts) })}
    </p>
  );
}

export function CallStatePill({
  call,
  now,
}: {
  call: PublicCall;
  now: number;
}) {
  const t = useTranslations('projects');
  const state = callWindowState(call, now);
  return (
    <StatusPill
      tone={
        state === 'open' ? 'good' : state === 'upcoming' ? 'pending' : 'neutral'
      }
    >
      {vocabulary(t, 'callState_', state)}
    </StatusPill>
  );
}

// Dated calls (F-60) on /appels-a-projets: open, upcoming, archived.
export function CallsList() {
  const t = useTranslations('projects');
  const tl = useTranslations('library');
  const calls = useQuery(api.projectCalls.listPublicCalls);
  const fund = useFundFormat();
  // The visitor's time, frozen on mount: the ordering doesn't shift before
  // their eyes while reading.
  const [now] = useState(() => Date.now());
  if (calls === undefined)
    return <p className="text-ink-soft">{t('loading')}</p>;
  const groups = {
    open: calls.filter((c) => callWindowState(c, now) === 'open'),
    upcoming: calls.filter((c) => callWindowState(c, now) === 'upcoming'),
    closed: calls.filter((c) => callWindowState(c, now) === 'closed'),
  };
  const section = (
    key: 'open' | 'upcoming' | 'closed',
    title: string,
    empty: string,
  ) => (
    <section key={key} className="mt-8" aria-labelledby={`calls-${key}-h`}>
      <h3 id={`calls-${key}-h`} className="font-display text-xl">
        {title}
      </h3>
      {groups[key].length === 0 ? (
        <p className="mt-2 text-[15px] text-ink-soft">{empty}</p>
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {groups[key].map((c) => (
            <li
              key={c._id}
              className="flex flex-col rounded-md border border-line bg-surface p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <CallStatePill call={c} now={now} />
                <span className="font-mono text-sm text-accent-text">
                  {fund(c.fundAmount, c.fundCurrency)}
                </span>
              </div>
              <h4 className="mt-3 wrap-anywhere font-display text-lg leading-tight">
                <Link
                  href={`/appels-a-projets/${c.slug}`}
                  className="hover:underline"
                >
                  {c.title}
                </Link>
              </h4>
              <p className="mt-2 line-clamp-3 wrap-anywhere text-[14px] text-ink-soft">
                {c.summary}
              </p>
              <div className="mt-3">
                <CallWindowLine call={c} now={now} />
              </div>
              {c.themes.length ? (
                <p className="mt-2 text-[13px] text-accent-text">
                  {c.themes
                    .map((s) => vocabulary(tl, 'themes.', s))
                    .join(' · ')}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <div>
      {section('open', t('callsOpen'), t('callsOpenEmpty'))}
      {groups.upcoming.length
        ? section('upcoming', t('callsUpcoming'), '')
        : null}
      {section('closed', t('callsArchived'), t('callsArchivedEmpty'))}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { vocabulary } from '@/i18n/vocabulary';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// AUDIENCE DASHBOARD (F-66, outreach workstream) — admin/impact screen.
//
// A single series per chart (page views), hence a single shade — the
// tokens' accent, in light as in dark — and no legend: the title names the
// series. Each bar carries its tooltip (exact value on hover and on keyboard
// focus), and the same figures exist as a TABLE (rankings) or as a list
// readable by a screen reader (daily curve).
//
// The end day is computed HERE, client-side: a Convex query does not read
// the clock (it would not be re-evaluated when the day changes).

type Range = 7 | 30 | 90;
const RANGES: Range[] = [7, 30, 90];

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-line bg-surface p-4">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Ranking as a table, with a magnitude bar (one shade). */
function Ranking({
  rows,
  colLabel,
  label,
  empty,
}: {
  rows: { key: string; count: number }[];
  colLabel: string;
  label: (key: string) => string;
  empty: string;
}) {
  const t = useTranslations('analytics');
  const format = useFormatter();
  if (rows.length === 0)
    return <p className="text-sm text-ink-soft">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="text-start text-xs text-muted">
          <th scope="col" className="pb-1 text-start font-normal">
            {colLabel}
          </th>
          <th scope="col" className="w-20 pb-1 text-end font-normal">
            {t('colViews')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="align-top">
            <td className="py-1 pe-3">
              <span className="block wrap-anywhere text-ink" dir="ltr">
                {label(r.key)}
              </span>
              <span
                aria-hidden="true"
                className="mt-1 block h-1.5 rounded-e-sm bg-accent"
                style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }}
              />
            </td>
            <td className="py-1 text-end font-mono text-ink-soft">
              {format.number(r.count)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AudienceDashboard() {
  const t = useTranslations('analytics');
  const format = useFormatter();
  const locale = useLocale();
  const [days, setDays] = useState<Range>(30);
  // Computed once per mount: a screen left open after midnight keeps its
  // period, which is better than a chart that shifts on its own.
  const [until] = useState(todayUtc);
  const overview = useQuery(api.audience.overview, { until, days });
  const pages = useQuery(api.audience.top, { until, days, dimension: 'page' });
  const refs = useQuery(api.audience.top, {
    until,
    days,
    dimension: 'referrer',
  });

  const langName = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale], { type: 'language' });
    } catch {
      names = null;
    }
    return (code: string) => names?.of(code) ?? code;
  }, [locale]);

  const pageLabel = (key: string) =>
    key === '(other)' ? t('other') : key === '/' ? t('homePage') : key;
  const dayLabel = (day: string) =>
    format.dateTime(new Date(`${day}T00:00:00Z`), {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  const max = Math.max(1, ...(overview?.byDay.map((d) => d.count) ?? [1]));

  return (
    <section className="mt-12" aria-labelledby="audience-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="audience-title" className="font-display text-2xl">
            {t('title')}
          </h2>
          <p className="mt-1 max-w-[70ch] text-sm text-ink-soft">
            {t('intro')}
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={String(days)}
          onValueChange={(v) => {
            const next = RANGES.find((r) => String(r) === v);
            if (next) setDays(next);
          }}
          aria-label={t('range')}
        >
          {RANGES.map((r) => (
            <ToggleGroupItem key={r} value={String(r)}>
              {r === 7
                ? t('range_7')
                : r === 30
                  ? t('range_30')
                  : t('range_90')}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {overview === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-md border border-accent-edge bg-accent-tint p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                {t('total')}
              </p>
              <p className="mt-2 font-display text-4xl text-accent-text">
                {format.number(overview.total)}
              </p>
            </div>
            <Card title={t('langs')}>
              <Ranking
                rows={overview.langs}
                colLabel={t('langs')}
                label={langName}
                empty={t('empty')}
              />
            </Card>
            <Card title={t('screens')}>
              <Ranking
                rows={overview.screens}
                colLabel={t('screens')}
                label={(k) => vocabulary(t, 'screen_', k)}
                empty={t('empty')}
              />
            </Card>
          </div>

          <div className="mt-4">
            <Card title={t('perDay')}>
              {overview.total === 0 ? (
                <p className="text-sm text-ink-soft">{t('empty')}</p>
              ) : (
                <ol
                  aria-label={t('perDay')}
                  className="flex h-40 items-end gap-[2px]"
                >
                  {overview.byDay.map((d) => {
                    const text = t('dayViews', {
                      day: dayLabel(d.day),
                      count: d.count,
                    });
                    return (
                      <li
                        key={d.day}
                        className="group relative flex h-full min-w-0 flex-1 items-end"
                      >
                        <span
                          tabIndex={0}
                          aria-label={text}
                          title={text}
                          className="block w-full rounded-t-sm bg-accent outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                          style={{
                            height: `${d.count === 0 ? 0 : Math.max(2, (d.count / max) * 100)}%`,
                          }}
                        />
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute bottom-full start-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-sm border border-line bg-surface px-2 py-1 text-xs text-ink shadow-pop group-focus-within:block group-hover:block rtl:translate-x-1/2"
                        >
                          {text}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span>{dayLabel(overview.byDay[0]?.day ?? until)}</span>
                <span>{dayLabel(until)}</span>
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card title={t('pages')}>
              {pages === undefined ? (
                <p className="text-sm text-ink-soft">{t('loading')}</p>
              ) : (
                <Ranking
                  rows={pages.items}
                  colLabel={t('colPage')}
                  label={pageLabel}
                  empty={t('empty')}
                />
              )}
            </Card>
            <Card title={t('content')}>
              {pages === undefined ? (
                <p className="text-sm text-ink-soft">{t('loading')}</p>
              ) : (
                <Ranking
                  rows={pages.content}
                  colLabel={t('colPage')}
                  label={pageLabel}
                  empty={t('empty')}
                />
              )}
            </Card>
            <Card title={t('referrers')}>
              {refs === undefined ? (
                <p className="text-sm text-ink-soft">{t('loading')}</p>
              ) : (
                <Ranking
                  rows={refs.items}
                  colLabel={t('colSite')}
                  label={pageLabel}
                  empty={t('empty')}
                />
              )}
            </Card>
          </div>
          {pages?.truncated || refs?.truncated ? (
            <p className="mt-2 text-xs text-ink-soft">{t('truncated')}</p>
          ) : null}
          <p className="mt-3 text-xs text-muted">
            {t('retention', { days: overview.retentionDays })}
          </p>
        </>
      )}
    </section>
  );
}

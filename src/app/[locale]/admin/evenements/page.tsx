'use client';

import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { resolveLocale } from '@/i18n/locale';
import { getEventsLabels } from '@/lib/events-content';
import { ScrollableRegion } from '@/components/ui/scrollable-region';

export default function AdminEvents() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const loc = resolveLocale(locale);
  const labels = getEventsLabels(loc);
  const regs = useQuery(api.events.listEventRegistrations);

  // Regroupe les inscriptions par événement (la liste arrive triée par date
  // décroissante : l'ordre des groupes suit l'inscription la plus récente).
  const groups = useMemo(() => {
    const map = new Map<string, NonNullable<typeof regs>>();
    for (const r of regs ?? []) {
      const arr = map.get(r.eventSlug) ?? [];
      arr.push(r);
      map.set(r.eventSlug, arr);
    }
    return [...map.entries()];
  }, [regs]);

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(loc, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  return (
    <div>
      <h1 className="font-display text-3xl">{t('evTitle')}</h1>

      {regs === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : groups.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('evEmpty')}</p>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map(([slug, list]) => (
            <section key={slug}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl">
                  {labels.titles[slug] ?? slug}
                </h2>
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  {t('evCount', { count: list.length })}
                </span>
              </div>
              <div className="mt-3 overflow-hidden rounded-md border border-line">
                <ScrollableRegion label={labels.titles[slug] ?? slug}>
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-[12px] uppercase tracking-[0.04em] text-muted">
                        <th scope="col" className="px-4 py-2.5 font-medium">
                          {t('evName')}
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-medium">
                          {t('evEmail')}
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-medium">
                          {t('evOrg')}
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-medium">
                          {t('evDate')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r) => (
                        <tr
                          key={r._id}
                          className="border-b border-line last:border-0"
                        >
                          <td className="px-4 py-2.5 font-medium text-ink">
                            {r.name}
                          </td>
                          <td className="px-4 py-2.5 text-ink-soft">
                            <a
                              href={`mailto:${r.email}`}
                              className="hover:text-ink hover:underline"
                            >
                              {r.email}
                            </a>
                          </td>
                          <td className="px-4 py-2.5 text-ink-soft">
                            {r.organization ?? '—'}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[12px] text-muted">
                            {fmtDate(r.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableRegion>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

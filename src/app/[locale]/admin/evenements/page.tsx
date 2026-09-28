'use client';

import { useMemo } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { resolveLocale, intlLocale } from '@/i18n/locale';
import { Link } from '@/i18n/navigation';
import { roleRank } from '@/lib/roles';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Button } from '@/components/ui/button';
import { ScrollableRegion } from '@/components/ui/scrollable-region';
import { useRunAction } from '@/components/admin/contenus/editor-shell';
import { useActionFeedback } from '@/components/admin/action-feedback';

// EVENT REGISTRATIONS (F-53) — moderator rank.
//
// Integrated into the "content" workstream without being duplicated: events
// are EDITED under `/admin/contenus/evenements` (editor rank); here we READ their
// registrants. Each event's title now comes from the table (in the
// screen's language), and each group carries its CSV export — a logged
// mutation, since personal data leaves the system.
export default function AdminEvents() {
  const t = useTranslations('admin');
  const tc = useTranslations('contentAdmin');
  const locale = useLocale();
  const loc = resolveLocale(locale);
  const me = useQuery(api.users.current);
  const regs = useQuery(api.events.listEventRegistrations, { locale: loc });
  const exportRegs = useMutation(api.events.exportEventRegistrations);
  const { run } = useRunAction();
  const notify = useActionFeedback();

  // Groups registrations by event (the list arrives sorted by descending
  // date: the order of groups follows the most recent registration).
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
    new Intl.DateTimeFormat(intlLocale(loc), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  async function exportCsv(slug: string) {
    const rows = await run(() => exportRegs({ eventSlug: slug }));
    if (!rows) return;
    const csv = toCsv(
      [t('evName'), t('evEmail'), t('evOrg'), tc('reg_lang'), t('evDate')],
      rows.map((r) => [
        r.name,
        r.email,
        r.organization ?? '',
        r.locale ?? '',
        new Date(r.createdAt).toISOString(),
      ]),
    );
    downloadCsv(`inscrits-${slug}.csv`, csv);
    notify(tc('reg_exported', { count: rows.length }));
  }

  const isEditor = roleRank(me?.role) >= roleRank('editeur');

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{t('evTitle')}</h1>
        {isEditor ? (
          <Link
            href="/admin/contenus/evenements"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline"
          >
            {tc('reg_manage')}
          </Link>
        ) : null}
      </div>

      {regs === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : groups.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('evEmpty')}</p>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map(([slug, list]) => {
            const title = list[0].eventTitle ?? tc('reg_unknown', { slug });
            return (
              <section key={slug} id={slug} className="scroll-mt-24">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-xl wrap-anywhere">
                    {title}
                  </h2>
                  <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                    {t('evCount', { count: list.length })}
                  </span>
                </div>
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    aria-label={tc('reg_exportFor', { title })}
                    onClick={() => exportCsv(slug)}
                  >
                    {tc('reg_export')}
                  </Button>
                </div>
                <div className="mt-3 overflow-hidden rounded-md border border-line">
                  <ScrollableRegion label={title}>
                    <table className="w-full border-collapse text-start text-sm">
                      <thead>
                        <tr className="border-b border-line text-[12px] uppercase tracking-[0.04em] text-muted">
                          {/* First column pinned while scrolling (27/09, C-1). */}
                          <th
                            scope="col"
                            className="sticky start-0 z-[1] bg-paper px-4 py-2.5 font-medium"
                          >
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
                            <td className="sticky start-0 z-[1] wrap-anywhere bg-paper px-4 py-2.5 font-medium text-ink">
                              {r.name}
                            </td>
                            <td className="px-4 py-2.5 text-ink-soft">
                              <a
                                href={`mailto:${r.email}`}
                                className="inline-block py-1 hover:text-ink hover:underline"
                              >
                                {r.email}
                              </a>
                            </td>
                            <td className="px-4 py-2.5 text-ink-soft wrap-anywhere">
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
            );
          })}
        </div>
      )}
    </div>
  );
}

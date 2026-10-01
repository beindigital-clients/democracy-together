'use client';

import { useState } from 'react';
import { useQuery, usePaginatedQuery } from 'convex/react';
import { useTranslations, useLocale } from 'next-intl';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { isAdmin } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { AdminSearch } from '@/components/admin/admin-search';
import { LoadMore } from '@/components/admin/load-more';
import { ScrollableRegion } from '@/components/ui/scrollable-region';
import { intlLocale } from '@/i18n/locale';
import { Badge } from '@/components/ui/badge';

type Row = FunctionReturnType<typeof api.journal.listAuditLog>['page'][number];

// RFC 4180 escaping: a field containing a double quote, a comma, a
// line break (CR or LF) is wrapped in double quotes; internal double quotes
// are doubled.
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowsToCsv(headers: string[], rows: string[][]): string {
  // Lines separated by CRLF (RFC 4180).
  return [headers, ...rows]
    .map((cols) => cols.map(csvField).join(','))
    .join('\r\n');
}

// Log page size. The server re-caps it: it is indicative.
const PAGE_SIZE = 50;

// Activity log & export (F-67) — back office, ADMINISTRATORS only.
// Table of sensitive actions (date, action, actor, target) + CSV export
// built client-side and downloaded via Blob + URL.createObjectURL.
export default function AdminJournal() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const me = useQuery(api.users.current);
  // SEARCHABLE AND FILTERABLE BY ACTOR (issue #49) — both server-side.
  //
  // The search covers the action: the dotted slug is split by the full-text
  // index, so "publication" brings up the whole family. The actor filter,
  // however, is not chosen from a dropdown menu: actors
  // are not all staff (a member submitting writes
  // `publication.submitted`), and enumerating those present in the log
  // would require walking it — the read that issue #8 removed. We therefore
  // take it WHERE IT IS ALREADY DISPLAYED: each row makes its actor
  // clickable, which answers exactly "everything this person has done".
  const [search, setSearch] = useState('');
  const [actor, setActor] = useState<{
    id: Id<'users'>;
    label: string;
  } | null>(null);
  // PAGINATED (issue #8): the log is the fastest-growing table in the
  // product — one row per sensitive action. The CSV export covers what is
  // loaded: loading more widens it accordingly, and active filters
  // narrow it accordingly.
  const {
    results: entries,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.journal.listAuditLog,
    isAdmin(me?.role)
      ? {
          ...(search ? { search } : {}),
          ...(actor ? { actorId: actor.id } : {}),
        }
      : 'skip',
    { initialNumItems: PAGE_SIZE },
  );

  if (me === undefined) {
    return <p className="mt-6 text-ink-soft">{t('loading')}</p>;
  }
  if (!isAdmin(me?.role)) {
    return <p className="mt-6 text-ink-soft">{t('usersOnlyAdmin')}</p>;
  }

  const actorLabel = (e: Row) => e.actorName ?? e.actorEmail ?? '—';

  function exportCsv() {
    if (entries.length === 0) return;
    const headers = [t('jrDate'), t('jrAction'), t('jrActor'), t('jrTarget')];
    const data = entries.map((e) => [
      new Date(e.createdAt).toISOString(),
      e.action,
      e.actorName ?? e.actorEmail ?? '',
      e.targetId ?? '',
    ]);
    const csv = rowsToCsv(headers, data);

    // UTF-8 BOM so that Excel reads accented characters correctly.
    const blob = new Blob(['﻿', csv], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{t('jrTitle')}</h1>
        <Button
          type="button"
          variant="outline"
          onClick={exportCsv}
          disabled={entries.length === 0}
        >
          {t('jrExport')}
        </Button>
      </div>

      <AdminSearch
        label={t('searchJournalLabel')}
        placeholder={t('searchJournalPlaceholder')}
        value={search}
        onChange={setSearch}
        className="mt-4"
      />

      {/* Active actor filter: a tag that NAMES what is filtered and
          carries a way to drop it — without it, a list narrowed by a click
          in the table would be indistinguishable from an almost empty log. */}
      {actor ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <Badge variant="accent">
            {t('jrFilterActor', { actor: actor.label })}
          </Badge>
          <button
            type="button"
            onClick={() => setActor(null)}
            className="text-xs font-medium text-accent-text hover:underline"
          >
            {t('jrClearActor')}
          </button>
        </p>
      ) : null}

      {status === 'LoadingFirstPage' ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : entries.length === 0 ? (
        <p className="mt-6 text-ink-soft">
          {search || actor ? t('noResults') : t('jrEmpty')}
        </p>
      ) : (
        <ScrollableRegion label={t('jrTitle')} className="mt-6">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-start font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                {/* First column pinned while scrolling (27/09, C-1). */}
                <th className="sticky start-0 z-[1] bg-paper py-2 pe-4 font-normal">
                  {t('jrDate')}
                </th>
                <th className="py-2 pe-4 font-normal">{t('jrAction')}</th>
                <th className="py-2 pe-4 font-normal">{t('jrActor')}</th>
                <th className="py-2 font-normal">{t('jrTarget')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const rowActorId = e.actorId;
                return (
                  <tr key={i} className="border-b border-line align-top">
                    <td className="sticky start-0 z-[1] bg-paper py-3 pe-4 whitespace-nowrap text-ink-soft">
                      {new Date(e.createdAt).toLocaleString(intlLocale(locale))}
                    </td>
                    <td className="py-3 pe-4 font-mono text-[13px]">
                      {e.action}
                    </td>
                    <td className="py-3 pe-4">
                      {rowActorId ? (
                        <button
                          type="button"
                          onClick={() =>
                            setActor({
                              id: rowActorId,
                              label: actorLabel(e),
                            })
                          }
                          aria-label={t('jrFilterActor', {
                            actor: actorLabel(e),
                          })}
                          className="inline-block py-1 text-start text-accent-text hover:underline"
                        >
                          {actorLabel(e)}
                        </button>
                      ) : (
                        actorLabel(e)
                      )}
                    </td>
                    <td className="py-3 font-mono text-[12px] text-ink-soft break-all">
                      {e.targetId ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollableRegion>
      )}

      <LoadMore status={status} loadMore={loadMore} pageSize={PAGE_SIZE} />
    </div>
  );
}

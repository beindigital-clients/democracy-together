'use client';

import { useQuery, usePaginatedQuery } from 'convex/react';
import { useTranslations, useLocale } from 'next-intl';
import { api } from '@convex/_generated/api';
import { isAdmin } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { LoadMore } from '@/components/admin/load-more';

type Row = {
  action: string;
  createdAt: number;
  targetId: string | null;
  actorName: string | null;
  actorEmail: string | null;
};

// Échappement RFC 4180 : un champ qui contient un guillemet, une virgule, un
// retour à la ligne (CR ou LF) est entouré de guillemets ; les guillemets
// internes sont doublés.
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowsToCsv(headers: string[], rows: string[][]): string {
  // Lignes séparées par CRLF (RFC 4180).
  return [headers, ...rows]
    .map((cols) => cols.map(csvField).join(','))
    .join('\r\n');
}

// Taille de page du journal. Le serveur la replafonne : elle est indicative.
const PAGE_SIZE = 50;

// Journal d'activité & export (F-67) — back-office, ADMINISTRATEURS uniquement.
// Tableau des actions sensibles (date, action, acteur, cible) + export CSV
// construit côté client et téléchargé via Blob + URL.createObjectURL.
export default function AdminJournal() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const me = useQuery(api.users.current);
  // PAGINÉ (issue #8) : le journal est la table qui grossit le plus vite du
  // produit — une ligne par action sensible. L'export CSV porte sur ce qui est
  // chargé : charger la suite l'élargit d'autant.
  const {
    results: entries,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.journal.listAuditLog,
    isAdmin(me?.role) ? {} : 'skip',
    { initialNumItems: PAGE_SIZE },
  );

  if (me === undefined) {
    return <p className="mt-6 text-ink-soft">{t('loading')}</p>;
  }
  if (!isAdmin(me?.role)) {
    return <p className="mt-6 text-ink-soft">{t('usersOnlyAdmin')}</p>;
  }

  const actor = (e: Row) => e.actorName ?? e.actorEmail ?? '—';

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

    // BOM UTF-8 pour qu'Excel lise correctement les accents.
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

      {status === 'LoadingFirstPage' ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : entries.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('jrEmpty')}</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="py-2 pr-4 font-normal">{t('jrDate')}</th>
                <th className="py-2 pr-4 font-normal">{t('jrAction')}</th>
                <th className="py-2 pr-4 font-normal">{t('jrActor')}</th>
                <th className="py-2 font-normal">{t('jrTarget')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className="border-b border-line align-top">
                  <td className="py-3 pr-4 whitespace-nowrap text-ink-soft">
                    {new Date(e.createdAt).toLocaleString(locale)}
                  </td>
                  <td className="py-3 pr-4 font-mono text-[13px]">
                    {e.action}
                  </td>
                  <td className="py-3 pr-4">{actor(e)}</td>
                  <td className="py-3 font-mono text-[12px] text-ink-soft break-all">
                    {e.targetId ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LoadMore status={status} loadMore={loadMore} pageSize={PAGE_SIZE} />
    </div>
  );
}

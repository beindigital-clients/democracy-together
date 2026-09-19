'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export default function AdminReports() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const reports = useQuery(api.tribune.listReports);
  const resolve = useMutation(api.tribune.resolveReport);
  const [busy, setBusy] = useState<string | null>(null);

  const fmt = (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  async function act(reportId: string, action: 'dismiss' | 'remove') {
    setBusy(reportId);
    try {
      await resolve({ reportId: reportId as Id<'tribuneReports'>, action });
    } catch {
      /* idem */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl">{t('repTitle')}</h1>

      {reports === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : reports.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('repEmpty')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {reports.map((r) => (
            <li
              key={r._id}
              className="rounded-md border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-pill border border-line-strong px-2 py-0.5 font-mono uppercase tracking-[0.06em] text-muted">
                  {r.targetType === 'post' ? t('repPost') : t('repComment')}
                </span>
                <span className="font-mono text-muted">{fmt(r.createdAt)}</span>
              </div>
              <p className="mt-2 text-[15px] text-ink">{r.excerpt}</p>
              {r.reason ? (
                <p className="mt-1 text-[13px] italic text-ink-soft">
                  {t('repReason')} : {r.reason}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {r.postId ? (
                  <Link
                    href={`/tribune/${r.postId}`}
                    className="text-[13px] font-semibold text-accent-text hover:underline"
                  >
                    {t('repView')} →
                  </Link>
                ) : null}
                <span className="flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === r._id}
                  onClick={() => act(r._id, 'dismiss')}
                >
                  {t('repDismiss')}
                </Button>
                <Button
                  size="sm"
                  disabled={busy === r._id}
                  onClick={() => act(r._id, 'remove')}
                >
                  {t('repRemove')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

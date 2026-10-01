'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { ArrowForward } from '@/components/ui/arrow';
import { intlLocale } from '@/i18n/locale';
import { Badge } from '@/components/ui/badge';

export default function AdminReports() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const reports = useQuery(api.tribune.listReports);
  const resolve = useMutation(api.tribune.resolveReport);
  const notify = useActionFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  // "Retirer" unpublishes the content for everyone: it goes through a
  // confirmation that names the target — the type AND the reported excerpt, since
  // that is the only thing that distinguishes two rows in this queue (issue #38).
  // "Ignorer" destroys nothing and stays a single click.
  const [confirming, setConfirming] = useState<string | null>(null);

  const fmt = (ms: number) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  async function act(reportId: string, action: 'dismiss' | 'remove') {
    setBusy(reportId);
    try {
      await resolve({ reportId: reportId as Id<'tribuneReports'>, action });
      setConfirming(null);
      notify(
        t(
          action === 'remove'
            ? 'feedbackReportRemoved'
            : 'feedbackReportDismissed',
        ),
      );
    } catch {
      // Server refusal (insufficient role, report already handled): shown on
      // screen rather than swallowed, otherwise the moderator does not know whether their click
      // took effect.
      notify(t('feedbackError'), 'error');
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
                <Badge variant="outline" size="label">
                  {r.targetType === 'post' ? t('repPost') : t('repComment')}
                </Badge>
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
                    {t('repView')} <ArrowForward />
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
                  onClick={() => setConfirming(r._id)}
                >
                  {t('repRemove')}
                </Button>

                <ConfirmDialog
                  open={confirming === r._id}
                  title={t('confirmRemoveTitle', {
                    target: t(
                      r.targetType === 'post'
                        ? 'repTargetPost'
                        : 'repTargetComment',
                    ),
                  })}
                  description={t('confirmRemoveBody', { excerpt: r.excerpt })}
                  confirmLabel={t('confirmRemoveConfirm')}
                  cancelLabel={t('confirmCancel')}
                  destructive
                  pending={busy === r._id}
                  onConfirm={() => act(r._id, 'remove')}
                  onCancel={() => setConfirming(null)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

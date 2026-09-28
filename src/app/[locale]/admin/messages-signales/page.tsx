'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { intlLocale } from '@/i18n/locale';

// QUEUE OF REPORTED PRIVATE MESSAGES ("social" workstream) — moderator and
// above (`social.messages.listReports` checks it on the Convex side).
//
// Same model as the Tribune queue (/admin/signalements), with one
// fundamental difference: the moderator reads ONLY the message forwarded by the
// person who received it, never the rest of the conversation — Convex does not give
// them the means to. "Retirer" empties the message for both
// participants; the decision is logged, without the content.
export default function AdminMessageReports() {
  const t = useTranslations('messages');
  const locale = useLocale();
  const reports = useQuery(api.social.messages.listReports);
  const resolve = useMutation(api.social.messages.resolveReport);
  const notify = useActionFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const fmt = (ms: number) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  async function act(
    reportId: Id<'messageReports'>,
    action: 'dismiss' | 'remove',
  ) {
    setBusy(reportId);
    try {
      await resolve({ reportId, action });
      setConfirming(null);
      notify(t('admin.done'));
    } catch {
      notify(t('admin.error'), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl">{t('admin.title')}</h1>
      <p className="mt-2 max-w-[70ch] text-sm text-ink-soft">
        {t('admin.intro')}
      </p>

      {reports === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : reports.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('admin.empty')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {reports.map((r) => {
            const name = r.reportedName || t('unknownMember');
            return (
              <li
                key={r._id}
                className="rounded-md border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                  <span className="font-mono">{fmt(r.createdAt)}</span>
                  <span aria-hidden="true">·</span>
                  {r.reportedHandle ? (
                    <Link
                      href={`/membres/${r.reportedHandle}`}
                      className="text-accent-text hover:underline"
                    >
                      {t('admin.author', { name })}
                    </Link>
                  ) : (
                    <span>{t('admin.author', { name })}</span>
                  )}
                </div>
                {r.messageGone && !r.excerpt ? (
                  <p className="mt-2 text-[15px] italic text-muted">
                    {t('admin.gone')}
                  </p>
                ) : (
                  <blockquote className="mt-2 wrap-anywhere whitespace-pre-wrap border-s-2 border-line-strong ps-3 text-[15px] text-ink">
                    {r.excerpt}
                  </blockquote>
                )}
                {r.reason ? (
                  <p className="mt-2 wrap-anywhere text-[13px] italic text-ink-soft">
                    {t('admin.reason', { reason: r.reason })}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    disabled={busy === r._id}
                    onClick={() => act(r._id, 'dismiss')}
                  >
                    {t('admin.dismiss')}
                  </Button>
                  <Button
                    size="sm"
                    className="min-h-11"
                    disabled={busy === r._id || r.messageGone}
                    onClick={() => setConfirming(r._id)}
                  >
                    {t('admin.remove')}
                  </Button>
                  <ConfirmDialog
                    open={confirming === r._id}
                    title={t('admin.confirmTitle')}
                    description={t('admin.confirmBody', {
                      excerpt:
                        r.excerpt.length > 140
                          ? `${r.excerpt.slice(0, 140)}…`
                          : r.excerpt,
                    })}
                    confirmLabel={t('admin.remove')}
                    cancelLabel={t('cancel')}
                    destructive
                    pending={busy === r._id}
                    onConfirm={() => act(r._id, 'remove')}
                    onCancel={() => setConfirming(null)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

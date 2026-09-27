'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';
import { intlLocale } from '@/i18n/locale';

export default function AdminMentorship() {
  const t = useTranslations('admin');
  const tl = useTranslations('library');
  const locale = useLocale();
  const [pendingOnly, setPendingOnly] = useState(true);
  const requests = useQuery(api.mentorship.listMentorshipRequests, {
    status: pendingOnly ? 'pending' : undefined,
  });
  const review = useMutation(api.mentorship.reviewMentorshipRequest);
  const reopen = useMutation(api.mentorship.reopenMentorshipRequest);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Retour d'action (27/09, m-2 / A-08) : apparier, clôturer et rouvrir ne
  // disaient rien, et la note d'appariement n'était jamais rendue.
  const notify = useActionFeedback();
  const fail = useFailureFeedback();

  const fmt = (ms: number) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  async function decide(
    id: string,
    name: string,
    status: 'matched' | 'closed',
  ) {
    setBusy(id);
    try {
      await review({
        requestId: id as Id<'mentorshipRequests'>,
        status,
        notes: notes[id]?.trim() || undefined,
      });
      notify(
        t(
          status === 'matched'
            ? 'feedbackMentorMatched'
            : 'feedbackMentorClosed',
          { name },
        ),
      );
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  // Revenir sur une décision demande de ROUVRIR la demande (issue #9) : le
  // serveur refuse qu'on la retranche directement — un appariement clos ne
  // redevient pas « apparié » sur un second clic —, et la réouverture laisse
  // sa propre trace au journal.
  async function reopenRequest(id: string, name: string) {
    setBusy(id);
    try {
      await reopen({ requestId: id as Id<'mentorshipRequests'> });
      notify(t('feedbackReopened', { name }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{t('mTitle')}</h1>
        <div className="flex gap-1 rounded-md border border-line p-0.5">
          <button
            type="button"
            onClick={() => setPendingOnly(true)}
            className={`rounded px-3 py-1 text-sm ${pendingOnly ? 'bg-surface-2 text-ink' : 'text-ink-soft'}`}
          >
            {t('filterPending')}
          </button>
          <button
            type="button"
            onClick={() => setPendingOnly(false)}
            className={`rounded px-3 py-1 text-sm ${!pendingOnly ? 'bg-surface-2 text-ink' : 'text-ink-soft'}`}
          >
            {t('filterAll')}
          </button>
        </div>
      </div>

      {requests === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : requests.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('mEmpty')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {requests.map((m) => (
            <li
              key={m._id}
              className="rounded-md border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 wrap-anywhere font-medium text-ink">
                  {m.name}
                </h2>
                <Badge variant="outline">
                  {vocabulary(t, 'role_', m.role)}
                </Badge>
                <Badge variant="default">
                  {vocabulary(t, 'status_', m.status)}
                </Badge>
                <span className="font-mono text-[11px] text-muted">
                  {fmt(m.createdAt)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-ink-soft">
                <a
                  href={`mailto:${m.email}`}
                  className="hover:text-ink hover:underline"
                >
                  {m.email}
                </a>
                <span>· {m.country}</span>
                {m.themes.map((th) => (
                  <span key={th} className="text-accent-text">
                    #{vocabulary(tl, 'themes.', th)}
                  </span>
                ))}
              </div>
              <p className="mt-2 wrap-anywhere text-[14px] leading-relaxed text-ink">
                {m.message}
              </p>
              {m.reviewNotes ? (
                <p className="mt-2 wrap-anywhere text-[13px] text-muted">
                  {t('reviewNoteLabel')} {m.reviewNotes}
                </p>
              ) : null}

              {m.status === 'pending' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    value={notes[m._id] ?? ''}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [m._id]: e.target.value }))
                    }
                    placeholder={t('appNotesPlaceholder')}
                    className="max-w-xs"
                  />
                  <span className="flex-1" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === m._id}
                    onClick={() => decide(m._id, m.name, 'closed')}
                  >
                    {t('mClose')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy === m._id}
                    onClick={() => decide(m._id, m.name, 'matched')}
                  >
                    {t('mMatch')}
                  </Button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="flex-1" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === m._id}
                    onClick={() => reopenRequest(m._id, m.name)}
                  >
                    {t('reopen')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

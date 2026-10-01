'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';
import { intlLocale } from '@/i18n/locale';
import { ProgrammeAdminLink } from '@/components/programmes/admin-links';

export default function AdminYouth() {
  const t = useTranslations('admin');
  const tl = useTranslations('library');
  const locale = useLocale();
  const [pendingOnly, setPendingOnly] = useState(true);
  const apps = useQuery(api.youth.listYouthApplications, {
    status: pendingOnly ? 'pending' : undefined,
  });
  const review = useMutation(api.youth.reviewYouthApplication);
  const reopen = useMutation(api.youth.reopenYouthApplication);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Action feedback (27/09, m-2 / A-08): the row changed state without a
  // word, and a server refusal ("déjà traitée ailleurs") stayed silent.
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
    decision: 'approved' | 'rejected',
  ) {
    setBusy(id);
    try {
      await review({
        applicationId: id as Id<'youthApplications'>,
        decision,
        notes: notes[id]?.trim() || undefined,
      });
      notify(
        t(
          decision === 'approved'
            ? 'feedbackYouthApproved'
            : 'feedbackYouthRejected',
          { name },
        ),
      );
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  // Going back on a decision requires REOPENING the application (issue #9):
  // the server refuses to have it re-decided directly, and reopening leaves
  // its own trace in the log.
  async function reopenApplication(id: string, name: string) {
    setBusy(id);
    try {
      await reopen({ applicationId: id as Id<'youthApplications'> });
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
        <div>
          <h1 className="font-display text-3xl">{t('yTitle')}</h1>
          <ProgrammeAdminLink kind="youth" />
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          value={pendingOnly ? 'pending' : 'all'}
          onValueChange={(v) => {
            if (v) setPendingOnly(v === 'pending');
          }}
          aria-label={t('filterStatusLabel')}
        >
          <ToggleGroupItem value="pending">
            {t('filterPending')}
          </ToggleGroupItem>
          <ToggleGroupItem value="all">{t('filterAll')}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {apps === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : apps.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('yEmpty')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {apps.map((a) => (
            <li
              key={a._id}
              className="rounded-md border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 wrap-anywhere font-medium text-ink">
                  {a.name}
                </h2>
                <Badge variant="default">
                  {vocabulary(t, 'status_', a.status)}
                </Badge>
                <span className="font-mono text-[11px] text-muted">
                  {fmt(a.createdAt)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-ink-soft">
                <a
                  href={`mailto:${a.email}`}
                  className="hover:text-ink hover:underline"
                >
                  {a.email}
                </a>
                <span>· {a.country}</span>
                {a.themes.map((th) => (
                  <span key={th} className="text-accent-text">
                    #{vocabulary(tl, 'themes.', th)}
                  </span>
                ))}
              </div>
              <p className="mt-2 wrap-anywhere text-[14px] leading-relaxed text-ink">
                {a.motivation}
              </p>
              {/* The decision note, finally rendered (27/09, A-08). */}
              {a.reviewNotes ? (
                <p className="mt-2 wrap-anywhere text-[13px] text-muted">
                  {t('reviewNoteLabel')} {a.reviewNotes}
                </p>
              ) : null}

              {a.status === 'pending' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    value={notes[a._id] ?? ''}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [a._id]: e.target.value }))
                    }
                    placeholder={t('appNotesPlaceholder')}
                    className="max-w-xs"
                  />
                  <span className="flex-1" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === a._id}
                    onClick={() => decide(a._id, a.name, 'rejected')}
                  >
                    {t('reject')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy === a._id}
                    onClick={() => decide(a._id, a.name, 'approved')}
                  >
                    {t('approve')}
                  </Button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="flex-1" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === a._id}
                    onClick={() => reopenApplication(a._id, a.name)}
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

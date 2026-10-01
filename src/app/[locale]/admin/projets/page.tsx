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

// Review queue for collaborative project proposals (F-60). Moderator+.
export default function AdminProjects() {
  const t = useTranslations('admin');
  const tl = useTranslations('library');
  const locale = useLocale();
  const [pendingOnly, setPendingOnly] = useState(true);
  const proposals = useQuery(api.projects.listProjectProposals, {
    status: pendingOnly ? 'pending' : undefined,
  });
  const review = useMutation(api.projects.reviewProjectProposal);
  const reopen = useMutation(api.projects.reopenProjectProposal);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Action feedback (27/09, m-2 / m-5): deciding and reopening stayed silent.
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
    title: string,
    decision: 'accepted' | 'rejected',
  ) {
    setBusy(id);
    try {
      await review({
        proposalId: id as Id<'projectProposals'>,
        decision,
        notes: notes[id]?.trim() || undefined,
      });
      notify(
        t(
          decision === 'accepted'
            ? 'feedbackProjectAccepted'
            : 'feedbackProjectRejected',
          { title },
        ),
      );
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  // Going back on a decision requires REOPENING the proposal (issue #9): the
  // server refuses to have it re-decided directly, and reopening leaves its
  // own trace in the log.
  async function reopenProposal(id: string, title: string) {
    setBusy(id);
    try {
      await reopen({ proposalId: id as Id<'projectProposals'> });
      notify(t('feedbackReopened', { name: title }));
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
          <h1 className="font-display text-3xl">{t('prjTitle')}</h1>
          <ProgrammeAdminLink kind="calls" />
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

      {proposals === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : proposals.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('prjEmpty')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {proposals.map((p) => (
            <li
              key={p._id}
              className="rounded-md border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 wrap-anywhere font-medium text-ink">
                  {p.title}
                </h2>
                <Badge variant="default">
                  {vocabulary(t, 'prjStatus_', p.status)}
                </Badge>
                <span className="font-mono text-[11px] text-muted">
                  {fmt(p.createdAt)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-ink-soft">
                <span>{p.authorName}</span>
                <span className="text-accent-text">
                  #{vocabulary(tl, 'themes.', p.theme)}
                </span>
              </div>
              <p className="mt-2 wrap-anywhere text-[14px] leading-relaxed text-ink">
                {p.summary}
              </p>
              {p.reviewNotes ? (
                <p className="mt-2 wrap-anywhere text-[13px] text-muted">
                  {t('prjNotesLabel')} {p.reviewNotes}
                </p>
              ) : null}

              {p.status === 'pending' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    value={notes[p._id] ?? ''}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [p._id]: e.target.value }))
                    }
                    placeholder={t('prjNotesPlaceholder')}
                    className="max-w-xs"
                  />
                  <span className="flex-1" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === p._id}
                    onClick={() => decide(p._id, p.title, 'rejected')}
                  >
                    {t('prjReject')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy === p._id}
                    onClick={() => decide(p._id, p.title, 'accepted')}
                  >
                    {t('prjAccept')}
                  </Button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="flex-1" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === p._id}
                    onClick={() => reopenProposal(p._id, p.title)}
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

'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { KOHOP_BOUNDS } from '@convex/lib/kohop';
import { AuthGateLoading } from '@/components/auth/auth-gate';
import { MemberPageHeader } from '@/components/member/page-header';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError } from '@/components/ui/field';
import { vocabulary } from '@/i18n/vocabulary';
import { AuthorEditor } from '@/components/kohop/author-editor';
import { KohopText } from '@/components/kohop/kohop-text';
import { RevisionPanel } from '@/components/kohop/revision-panel';
import { ReviewsList } from '@/components/kohop/reviews-list';
import { StageBadge } from '@/components/kohop/stage-badge';
import {
  DesignatedReviewers,
  ReviewerPicker,
} from '@/components/kohop/reviewer-picker';
import { useKohopDates, useKohopError } from '@/components/kohop/use-kohop';

export default function KohopAuthorFile() {
  const t = useTranslations('kohop');
  const dates = useKohopDates();
  const errorMessage = useKohopError();
  const params = useParams<{ id: string }>();
  const id = params.id as Id<'kohopContributions'>;
  const file = useQuery(api.kohop.getMine, { contributionId: id });
  const withdraw = useMutation(api.kohop.withdraw);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (file === undefined) return <AuthGateLoading />;
  if (file === null) {
    return (
      <div className="max-w-3xl">
        <MemberPageHeader title={t('notFoundTitle')} lead={t('notFoundBody')} />
        <p className="mt-6">
          <Link
            href="/espace-membre/kohop"
            className="inline-block py-1 font-medium text-accent-text hover:underline"
          >
            {t('backToList')}
          </Link>
        </p>
      </div>
    );
  }

  const canWithdraw = file.authorActions.includes('withdraw');
  const activeTitulars = file.reviewers.filter(
    (r) => r.slot === 'titular' && r.status !== 'recused',
  ).length;
  const needsReplacement =
    ['submitted', 'in_review', 'revision'].includes(file.stage) &&
    activeTitulars < KOHOP_BOUNDS.reviewers.titular;
  const due = file.revisionDueAt ?? file.proofDueAt ?? file.returnedDueAt;

  async function doWithdraw() {
    setBusy(true);
    setError('');
    try {
      await withdraw({ contributionId: id });
      setConfirming(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <MemberPageHeader
        eyebrow={t('authorTitle')}
        title={file.title || t('untitled')}
        actions={<StageBadge stage={file.stage} />}
      />

      <section
        aria-labelledby="kohop-status"
        className="mt-6 rounded-md border border-line bg-surface p-5 sm:p-6"
      >
        <h2 id="kohop-status" className="font-display text-xl text-ink">
          {t('whereItStands')}
        </h2>
        <p className="mt-2 max-w-[68ch] text-ink-soft">
          {vocabulary(t, 'stageHint_', file.stage)}
        </p>
        {due ? (
          <p className="mt-2 text-sm font-medium text-ink">
            {t('dueOn', { date: dates.day(due) })}
          </p>
        ) : null}
        {file.lastDecision && ['returned', 'refused'].includes(file.stage) ? (
          <div className="mt-4 rounded-md border border-line bg-surface-2 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
              {t('messageFromChief')}
            </p>
            <p className="mt-1 whitespace-pre-line wrap-anywhere text-ink">
              {file.lastDecision.reason}
            </p>
            {file.lastDecision.reasonCode ? (
              <p className="mt-2 text-xs text-muted">
                {vocabulary(t, 'reason_', file.lastDecision.reasonCode)}
              </p>
            ) : null}
          </div>
        ) : null}
        {canWithdraw ? (
          <div className="mt-4">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirming(true)}
            >
              {t('withdraw')}
            </Button>
            <FormError className="mt-2">{error}</FormError>
            <ConfirmDialog
              open={confirming}
              title={t('withdrawConfirmTitle', {
                title: file.title || t('untitled'),
              })}
              description={t('withdrawConfirmBody')}
              confirmLabel={t('withdrawConfirm')}
              cancelLabel={t('cancel')}
              destructive
              pending={busy}
              onConfirm={doWithdraw}
              onCancel={() => setConfirming(false)}
            />
          </div>
        ) : null}
      </section>

      {file.reviews.length > 0 ? (
        <section aria-labelledby="kohop-analyses" className="mt-8">
          <h2 id="kohop-analyses" className="font-display text-2xl">
            {t('reviewsSectionTitle')}
          </h2>
          <p className="mt-1 max-w-[68ch] text-sm text-ink-soft">
            {t('reviewsSectionLead')}
          </p>
          <div className="mt-4">
            <ReviewsList reviews={file.reviews} lang={file.lang} />
          </div>
        </section>
      ) : null}

      {file.revisable ? <RevisionPanel file={file} /> : null}

      {file.editable ? (
        <AuthorEditor file={file} />
      ) : file.revisable ? null : (
        <div className="mt-8 space-y-8">
          {file.version ? (
            <section aria-labelledby="kohop-submitted-text">
              <h2 id="kohop-submitted-text" className="font-display text-2xl">
                {t('submittedText')}
              </h2>
              <p className="mt-2 max-w-[68ch] text-lg text-ink-soft">
                {file.version.standfirst}
              </p>
              <div className="mt-5 rounded-md border border-line bg-surface p-5 sm:p-8">
                <KohopText markdown={file.version.body} lang={file.lang} />
              </div>
            </section>
          ) : null}

          {file.response ? (
            <section aria-labelledby="kohop-your-reply">
              <h2 id="kohop-your-reply" className="font-display text-2xl">
                {t('yourReply')}
              </h2>
              <div className="mt-3 rounded-md border border-line bg-surface p-5">
                <KohopText markdown={file.response} lang={file.lang} />
              </div>
            </section>
          ) : null}

          <section aria-labelledby="kohop-reviewers-ro">
            <h2 id="kohop-reviewers-ro" className="font-display text-2xl">
              {t('sectionReviewers')}
            </h2>
            <div className="mt-3">
              <DesignatedReviewers
                reviewers={file.reviewers}
                editable={false}
              />
            </div>
            {needsReplacement ? (
              <div className="mt-6 rounded-md border border-accent-edge bg-accent-tint p-5">
                <h3 className="font-display text-lg text-ink">
                  {t('replacementTitle')}
                </h3>
                <p className="mt-1 text-sm text-ink-soft">
                  {t('replacementLead')}
                </p>
                <div className="mt-4">
                  <ReviewerPicker
                    contributionId={file._id}
                    reviewers={file.reviewers}
                  />
                </div>
              </div>
            ) : null}
          </section>
        </div>
      )}

      <section aria-labelledby="kohop-history" className="mt-10">
        <h2 id="kohop-history" className="font-display text-2xl">
          {t('history')}
        </h2>
        <ol className="mt-3 space-y-2 border-s-2 border-line ps-4">
          {file.events.map((e, i) => (
            <li key={`${e.kind}-${e.at}-${i}`} className="text-sm">
              <span className="font-medium text-ink">
                {vocabulary(t, 'event_', e.kind)}
              </span>
              <span className="ms-2 text-muted">{dates.day(e.at)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

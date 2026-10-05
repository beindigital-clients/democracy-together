'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import {
  KOHOP_BOUNDS,
  KOHOP_RECUSAL_REASONS,
  KOHOP_PRESUMPTION_BREAKING_CODES,
  KOHOP_REASON_CODES,
} from '@convex/lib/kohop';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SelectField } from '@/components/ui/choice-fields';
import { FormError } from '@/components/ui/field';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { KohopText } from '@/components/kohop/kohop-text';
import { ReviewsList } from '@/components/kohop/reviews-list';
import { TextDiff, diffStats } from '@/components/kohop/text-diff';
import { ProductionPanel } from '@/components/kohop/production-panel';
import { ReasonDialog } from '@/components/kohop/reason-dialog';
import { StageBadge } from '@/components/kohop/stage-badge';
import { useKohopDates, useKohopError } from '@/components/kohop/use-kohop';
import { vocabulary } from '@/i18n/vocabulary';

type Dossier = NonNullable<FunctionReturnType<typeof api.kohopChief.dossier>>;
type ReviewerRow = Dossier['reviewers'][number];

function Card({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="mt-6 rounded-md border border-line bg-surface p-5 sm:p-6"
    >
      <h2 id={id} className="font-display text-xl text-ink">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// A reviewer as the review chief sees them: identity, declared link, and
// EVERYTHING the checks found with its source. This is the only screen where
// that detail exists; the AI never rejects anyone, it reports.
function ReviewerCard({
  reviewer,
  canAct,
}: {
  reviewer: ReviewerRow;
  canAct: boolean;
}) {
  const t = useTranslations('kohop');
  const dates = useKohopDates();
  const errorMessage = useKohopError();
  const notify = useActionFeedback();
  const approve = useMutation(api.kohopChief.approveReviewer);
  const recuse = useMutation(api.kohopChief.recuseReviewer);
  const [recusing, setRecusing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Every check counts: the rules (at designation) and the open database (a
  // moment later). The level is the highest of them.
  const level = reviewer.linkChecks.some((c) => c.level === 'blocking')
    ? 'blocking'
    : reviewer.linkChecks.some((c) => c.level === 'flagged')
      ? 'flagged'
      : 'none';
  const withFindings = reviewer.linkChecks.filter((c) => c.findings.length > 0);
  const failedChecks = reviewer.linkChecks.filter((c) => c.failed);

  async function doApprove() {
    setBusy(true);
    setError('');
    try {
      await approve({ reviewerId: reviewer._id });
      notify(t('reviewerApproved', { name: reviewer.name }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function doRecuse(note: string, reason: string) {
    setBusy(true);
    setError('');
    try {
      await recuse({
        reviewerId: reviewer._id,
        reason: reason as (typeof KOHOP_RECUSAL_REASONS)[number],
        note,
      });
      setRecusing(false);
      notify(t('reviewerRecused', { name: reviewer.name }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-md border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="wrap-anywhere font-medium text-ink">{reviewer.name}</p>
          <p className="text-sm text-ink-soft">
            {[reviewer.affiliation, reviewer.email].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" size="label">
            {vocabulary(t, 'slot_', reviewer.slot)}
          </Badge>
          <Badge
            size="label"
            variant={
              reviewer.status === 'recused'
                ? 'bad'
                : reviewer.status === 'proposed'
                  ? 'pending'
                  : 'good'
            }
          >
            {vocabulary(t, 'reviewerStatus_', reviewer.status)}
          </Badge>
          <Badge
            size="label"
            variant={
              level === 'blocking'
                ? 'bad'
                : level === 'flagged'
                  ? 'pending'
                  : 'default'
            }
          >
            {vocabulary(t, 'linkLevel_', level)}
          </Badge>
        </div>
      </div>

      {reviewer.declaredRelationship ? (
        <p className="mt-2 text-sm text-ink-soft">
          {t('declaredBy')}{' '}
          {vocabulary(t, 'relationship_', reviewer.declaredRelationship)}
        </p>
      ) : null}

      {withFindings.length > 0 ? (
        withFindings.map((check, n) => (
          <div key={n} className="mt-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
              {t('findings')} ·{' '}
              {check.origin === 'ai'
                ? t('originAi')
                : check.origin === 'external'
                  ? t('originExternal')
                  : t('originRules')}{' '}
              · {dates.day(check.checkedAt)}
            </p>
            <ul className="mt-1 space-y-1 text-sm">
              {check.findings.map((f, i) => (
                <li key={i} className="rounded-sm bg-surface-2 px-3 py-2">
                  <span className="font-medium text-ink">
                    {vocabulary(t, 'linkType_', f.type)}
                  </span>
                  {' — '}
                  <span className="text-ink-soft">{f.detail}</span>
                  {f.url ? (
                    <>
                      {' '}
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-text underline"
                      >
                        {t('source')}
                      </a>
                    </>
                  ) : f.source ? (
                    <span className="text-muted"> ({f.source})</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <p className="mt-2 text-sm text-muted">{t('noFindings')}</p>
      )}
      {failedChecks.length > 0 ? (
        <p className="mt-2 text-sm text-bar-5">
          {t('linkCheckFailed')} —{' '}
          {failedChecks[0].error === 'NO_ORCID'
            ? t('linkErr_NO_ORCID')
            : t('linkErr_other')}
        </p>
      ) : null}

      {reviewer.recusal ? (
        <p className="mt-2 text-sm text-bar-5">
          {t('recusedFor')} {vocabulary(t, 'recusal_', reviewer.recusal.reason)}
          {reviewer.recusal.note ? ` — ${reviewer.recusal.note}` : ''}
        </p>
      ) : null}

      {canAct &&
      reviewer.status !== 'recused' &&
      reviewer.status !== 'submitted' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {reviewer.status === 'proposed' ? (
            <Button type="button" size="sm" disabled={busy} onClick={doApprove}>
              {t('approveReviewer')}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setError('');
              setRecusing(true);
            }}
          >
            {t('recuseReviewer')}
          </Button>
        </div>
      ) : null}
      <FormError className="mt-2">{error}</FormError>

      <ReasonDialog
        open={recusing}
        title={t('recuseTitle', { name: reviewer.name })}
        description={t('recuseBody')}
        confirmLabel={t('recuseConfirm')}
        reasonLabel={t('recuseNote')}
        codeLabel={t('recuseReason')}
        codes={KOHOP_RECUSAL_REASONS.map((r) => ({
          value: r,
          label: vocabulary(t, 'recusal_', r),
        }))}
        pending={busy}
        error={error}
        onConfirm={(note, code) => void doRecuse(note, code)}
        onCancel={() => setRecusing(false)}
      />
    </li>
  );
}

// Originality reports of the version being decided: the platform's own check
// and the external provider's. They inform; they decide nothing.
function OriginalityCard({ file, canAct }: { file: Dossier; canAct: boolean }) {
  const t = useTranslations('kohop');
  const dates = useKohopDates();
  const errorMessage = useKohopError();
  const notify = useActionFeedback();
  const data = useQuery(api.kohopOriginality.reports, {
    contributionId: file._id,
  });
  const rerun = useMutation(api.kohopOriginality.requestChecks);
  const acknowledge = useMutation(
    api.kohopOriginality.acknowledgeWithoutExternal,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!data) return null;
  const external = data.reports.find((r) => r.scope === 'external')?.report;
  const canAck =
    canAct &&
    file.stage === 'decision' &&
    external !== undefined &&
    external !== null &&
    external.status !== 'done' &&
    !external.acknowledged;

  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError('');
    try {
      await action();
      notify(done);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="kohop-originality" title={t('originalityTitle')}>
      <p className="text-sm text-ink-soft">
        {t('originalityLead', { version: data.version })}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {data.reports.map(({ scope, report }) => (
          <section
            key={scope}
            aria-labelledby={`orig-${scope}`}
            className="rounded-md border border-line bg-paper p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={`orig-${scope}`} className="font-medium text-ink">
                {scope === 'platform'
                  ? t('originalityPlatform')
                  : t('originalityExternal')}
              </h3>
              {report ? (
                <Badge
                  variant={
                    report.status === 'done'
                      ? 'good'
                      : report.status === 'failed'
                        ? 'bad'
                        : 'pending'
                  }
                  size="label"
                >
                  {vocabulary(t, 'origStatus_', report.status)}
                </Badge>
              ) : null}
            </div>
            {!report ? (
              <p className="mt-2 text-sm text-muted">{t('originalityNone')}</p>
            ) : (
              <>
                <p className="mt-1 font-mono text-xs text-muted">
                  {dates.day(report.checkedAt)}
                  {report.provider
                    ? ` · ${t('originalityProvider', { provider: report.provider })}`
                    : ''}
                </p>
                {report.error ? (
                  <p className="mt-1 text-sm text-ink-soft">
                    {t('originalityError', { error: report.error })}
                  </p>
                ) : null}
                {report.acknowledged ? (
                  <p className="mt-1 text-sm text-bar-1">
                    {t('originalityAcked')}
                  </p>
                ) : null}
                {report.status === 'done' ? (
                  report.matches.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-soft">
                      {t('originalityNoMatches')}
                    </p>
                  ) : (
                    <>
                      <p className="mt-2 text-sm font-medium text-ink">
                        {t('originalityMatches', {
                          count: report.matches.length,
                        })}
                      </p>
                      <ul className="mt-2 space-y-3">
                        {report.matches.map((m, i) => (
                          <li
                            key={i}
                            className="rounded-sm bg-surface-2 p-3 text-sm"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              {m.classification ? (
                                <Badge
                                  variant={
                                    m.classification === 'borrowing'
                                      ? 'bad'
                                      : 'default'
                                  }
                                  size="label"
                                >
                                  {vocabulary(
                                    t,
                                    'matchClass_',
                                    m.classification,
                                  )}
                                </Badge>
                              ) : null}
                              <span className="text-ink-soft">
                                {t('originalitySource', {
                                  title: m.sourceTitle,
                                })}
                              </span>
                            </div>
                            <p className="mt-2 wrap-anywhere text-ink">
                              « {m.passage} »
                            </p>
                          </li>
                        ))}
                      </ul>
                    </>
                  )
                ) : null}
              </>
            )}
          </section>
        ))}
      </div>
      {canAct ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void act(
                () => rerun({ contributionId: file._id }),
                t('originalityRerunDone'),
              )
            }
          >
            {t('originalityRerun')}
          </Button>
          {canAck ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void act(
                  () => acknowledge({ contributionId: file._id }),
                  t('originalityAcked'),
                )
              }
            >
              {t('originalityAck')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {canAck ? (
        <p className="mt-2 max-w-[68ch] text-sm text-muted">
          {t('originalityAckHelp')}
        </p>
      ) : null}
      <FormError className="mt-2">{error}</FormError>
    </Card>
  );
}

// The author's reply and what the revision changed, for the decision.
function RevisionDiff({ file }: { file: Dossier }) {
  const t = useTranslations('kohop');
  const read = file.versions.find((v) => v.version === file.reviewedVersion);
  const handedIn =
    file.submittedVersion !== null &&
    file.submittedVersion !== file.reviewedVersion
      ? file.versions.find((v) => v.version === file.submittedVersion)
      : undefined;
  const reply = handedIn?.response ?? null;
  if (!read) return null;
  const stats = handedIn ? diffStats(read.body, handedIn.body) : null;
  return (
    <div className="mt-6 space-y-4">
      <h3 className="font-display text-lg text-ink">{t('authorReply')}</h3>
      {reply ? (
        <div className="rounded-md border border-line bg-paper p-4">
          <KohopText markdown={reply} lang={file.lang} />
        </div>
      ) : (
        <p className="text-sm text-ink-soft">{t('noReply')}</p>
      )}
      {handedIn && stats ? (
        <div>
          <p className="text-sm text-ink-soft">
            {t('versionRead', { version: read.version })}
            {' · '}
            {t('versionHandedIn', { version: handedIn.version })}
          </p>
          <p className="mt-1 text-sm font-medium text-ink">
            {stats.added === 0 && stats.removed === 0
              ? t('noChanges')
              : t('changesSummary', {
                  added: stats.added,
                  removed: stats.removed,
                })}
          </p>
          {stats.added + stats.removed > 0 ? (
            <details className="mt-2 rounded-md border border-line bg-paper p-4">
              <summary className="cursor-pointer text-sm font-medium text-accent-text">
                {t('showChanges')}
              </summary>
              <div className="mt-3">
                <TextDiff
                  before={read.body}
                  after={handedIn.body}
                  lang={file.lang}
                />
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminKohopFile() {
  const t = useTranslations('kohop');
  const dates = useKohopDates();
  const errorMessage = useKohopError();
  const notify = useActionFeedback();
  const params = useParams<{ id: string }>();
  const id = params.id as Id<'kohopContributions'>;
  const file = useQuery(api.kohopChief.dossier, { contributionId: id });
  const originality = useQuery(api.kohopOriginality.reports, {
    contributionId: id,
  });
  const startReview = useMutation(api.kohopChief.startReview);
  const giveBack = useMutation(api.kohopChief.returnToAuthor);
  const inadmissible = useMutation(api.kohopChief.declareInadmissible);
  const acceptFile = useMutation(api.kohopDecision.accept);
  const refuseFile = useMutation(api.kohopDecision.refuseContribution);
  const [dialog, setDialog] = useState<
    'return' | 'inadmissible' | 'accept' | 'refuse' | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [versionPick, setVersionPick] = useState<string | null>(null);

  if (file === undefined) {
    return (
      <p className="text-ink-soft" role="status">
        {t('loading')}
      </p>
    );
  }
  if (file === null) {
    return <p className="text-ink-soft">{t('notFoundBody')}</p>;
  }

  const version =
    file.versions.find((v) => String(v.version) === versionPick) ??
    file.versions[0];
  const approvedTitulars = file.reviewers.filter(
    (r) => r.slot === 'titular' && r.status === 'approved',
  ).length;
  const canStart = file.chiefActions.includes('startReview');
  const startReady =
    approvedTitulars >= KOHOP_BOUNDS.reviewers.titular &&
    originality?.platformDone === true;
  const reviewerActionsOpen = ['submitted', 'in_review', 'revision'].includes(
    file.stage,
  );

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    try {
      await action();
      setDialog(null);
      notify(success);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <p>
        <Link
          href="/admin/kohop"
          className="inline-block py-1 text-sm text-accent-text hover:underline"
        >
          ← {t('backToQueue')}
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 wrap-anywhere font-display text-3xl">
          {file.title || t('untitled')}
        </h1>
        <StageBadge stage={file.stage} />
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        {[
          file.author.name,
          file.author.organization?.name,
          file.submittedAt
            ? t('submittedOn', { date: dates.day(file.submittedAt) })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>

      {file.chiefActions.length > 0 ? (
        <Card id="kohop-actions" title={t('actions')}>
          <div className="flex flex-wrap items-center gap-2">
            {canStart ? (
              <Button
                type="button"
                disabled={busy || !startReady}
                onClick={() =>
                  run(
                    () => startReview({ contributionId: id }),
                    t('reviewStarted'),
                  )
                }
              >
                {t('startReview')}
              </Button>
            ) : null}
            {file.chiefActions.includes('return') ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDialog('return')}
              >
                {t('returnToAuthor')}
              </Button>
            ) : null}
            {file.chiefActions.includes('accept') ? (
              <Button
                type="button"
                disabled={busy || originality?.gateOk !== true}
                onClick={() => setDialog('accept')}
              >
                {t('acceptButton')}
              </Button>
            ) : null}
            {file.chiefActions.includes('refuse') ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDialog('refuse')}
              >
                {t('refuseButton')}
              </Button>
            ) : null}
            {file.chiefActions.includes('declareInadmissible') ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDialog('inadmissible')}
              >
                {t('declareInadmissible')}
              </Button>
            ) : null}
          </div>
          {file.chiefActions.includes('accept') &&
          originality?.gateOk !== true ? (
            <p className="mt-2 text-sm text-muted">
              {t('originalityGateBlocked')}
            </p>
          ) : null}
          {canStart && originality?.platformDone !== true ? (
            <p className="mt-2 text-sm text-muted">
              {t('originalityStartBlocked')}
            </p>
          ) : null}
          {canStart && approvedTitulars < KOHOP_BOUNDS.reviewers.titular ? (
            <p className="mt-2 text-sm text-muted">
              {t('startNeedsReviewers', {
                validated: approvedTitulars,
                needed: KOHOP_BOUNDS.reviewers.titular,
              })}
            </p>
          ) : null}
          <FormError className="mt-2">{dialog ? '' : error}</FormError>
        </Card>
      ) : null}

      <ConfirmDialog
        open={dialog === 'accept'}
        title={t('acceptConfirmTitle', { title: file.title || t('untitled') })}
        description={t('acceptConfirmBody')}
        confirmLabel={t('acceptConfirm')}
        cancelLabel={t('cancel')}
        pending={busy}
        onConfirm={() =>
          void run(() => acceptFile({ contributionId: id }), t('accepted'))
        }
        onCancel={() => setDialog(null)}
      />
      <ReasonDialog
        open={dialog === 'refuse'}
        title={t('refuseTitle', { title: file.title || t('untitled') })}
        description={t('refuseDescription')}
        confirmLabel={t('refuseConfirm')}
        reasonLabel={t('refuseReasonLabel')}
        reasonHint={t('reasonHint', { min: KOHOP_BOUNDS.reason.min })}
        minLength={KOHOP_BOUNDS.reason.min}
        codeLabel={t('refuseCodeLabel')}
        // With the presumption of acceptance only these three codes are open.
        codes={(file.presumption
          ? KOHOP_PRESUMPTION_BREAKING_CODES
          : KOHOP_REASON_CODES
        ).map((c) => ({ value: c, label: vocabulary(t, 'reason_', c) }))}
        pending={busy}
        error={error}
        onConfirm={(reason, code) =>
          void run(
            () =>
              refuseFile({
                contributionId: id,
                code: code as (typeof KOHOP_REASON_CODES)[number],
                reason,
              }),
            t('refused'),
          )
        }
        onCancel={() => setDialog(null)}
      />
      <ReasonDialog
        open={dialog === 'return'}
        title={t('returnTitle', { title: file.title || t('untitled') })}
        description={t('returnBody')}
        confirmLabel={t('returnConfirm')}
        reasonLabel={t('reasonLabel')}
        reasonHint={t('reasonHint', { min: KOHOP_BOUNDS.reason.min })}
        minLength={KOHOP_BOUNDS.reason.min}
        pending={busy}
        error={error}
        onConfirm={(reason) =>
          void run(
            () => giveBack({ contributionId: id, reason }),
            t('returned'),
          )
        }
        onCancel={() => setDialog(null)}
      />
      <ReasonDialog
        open={dialog === 'inadmissible'}
        title={t('inadmissibleTitle', { title: file.title || t('untitled') })}
        description={t('inadmissibleBody')}
        confirmLabel={t('inadmissibleConfirm')}
        reasonLabel={t('reasonLabel')}
        reasonHint={t('reasonHint', { min: KOHOP_BOUNDS.reason.min })}
        minLength={KOHOP_BOUNDS.reason.min}
        codeLabel={t('reasonCodeLabel')}
        codes={KOHOP_REASON_CODES.map((c) => ({
          value: c,
          label: vocabulary(t, 'reason_', c),
        }))}
        pending={busy}
        error={error}
        onConfirm={(reason, code) =>
          void run(
            () =>
              inadmissible({
                contributionId: id,
                code: code as (typeof KOHOP_REASON_CODES)[number],
                reason,
              }),
            t('declaredInadmissible'),
          )
        }
        onCancel={() => setDialog(null)}
      />

      {file.reviews.length > 0 ? (
        <Card id="kohop-analyses" title={t('reviewsChiefTitle')}>
          <p className="text-sm text-ink-soft">{t('decisionLead')}</p>
          <p className="mt-2 text-sm font-medium text-ink">
            {t('positiveSummary', {
              positive: file.positiveReviews,
              total: file.reviews.length,
            })}
          </p>
          {['decision'].includes(file.stage) ? (
            <p
              className={
                file.presumption
                  ? 'mt-2 rounded-md border border-accent-edge bg-accent-tint p-3 text-sm text-ink'
                  : 'mt-2 text-sm text-ink-soft'
              }
            >
              {file.presumption ? t('presumptionOn') : t('presumptionOff')}
            </p>
          ) : null}
          <div className="mt-4">
            <ReviewsList reviews={file.reviews} lang={file.lang} />
          </div>
          <RevisionDiff file={file} />
        </Card>
      ) : null}

      {['production', 'proof', 'ready', 'scheduled', 'published'].includes(
        file.stage,
      ) ? (
        <ProductionPanel key={file.stage} file={file} />
      ) : null}

      {file.submittedVersion !== null ? (
        <OriginalityCard file={file} canAct={file.chiefActions.length > 0} />
      ) : null}

      <Card id="kohop-reviewers" title={t('sectionReviewers')}>
        {file.reviewers.length === 0 ? (
          <p className="text-sm text-ink-soft">{t('noReviewersYet')}</p>
        ) : (
          <ul className="space-y-3">
            {file.reviewers.map((r) => (
              <ReviewerCard
                key={r._id}
                reviewer={r}
                canAct={reviewerActionsOpen}
              />
            ))}
          </ul>
        )}
      </Card>

      {version ? (
        <Card id="kohop-text" title={t('submittedText')}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="font-mono text-xs text-ink-soft">
              {t('versionInfo', {
                version: version.version,
                words: version.wordCount,
              })}
              {file.submittedVersion === version.version
                ? ` · ${t('versionSubmitted')}`
                : ''}
            </p>
            {file.versions.length > 1 ? (
              <SelectField
                label={t('versionLabel')}
                labelHidden
                size="sm"
                controlClassName="w-auto"
                value={String(version.version)}
                onValueChange={setVersionPick}
                options={file.versions.map((v) => ({
                  value: String(v.version),
                  label: t('versionOption', { version: v.version }),
                }))}
              />
            ) : null}
          </div>
          <h3 className="mt-3 font-display text-2xl">{version.title}</h3>
          <p className="mt-1 text-lg text-ink-soft">{version.standfirst}</p>
          <div className="mt-4 rounded-md border border-line bg-paper p-5">
            <KohopText markdown={version.body} lang={file.lang} />
          </div>
          {version.links.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-medium text-ink">
                {t('furtherReading')}
              </p>
              <ul className="mt-1 list-disc space-y-1 ps-5 text-sm">
                {version.links.map((l, i) => (
                  <li key={i}>
                    {l.url ? (
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow ugc"
                        className="text-accent-text underline"
                      >
                        {l.label}
                      </a>
                    ) : (
                      l.label
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card id="kohop-author" title={t('sectionAuthor')}>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">{t('authorName')}</dt>
          <dd>{file.author.name ?? file.author.email ?? '—'}</dd>
          <dt className="text-muted">{t('authorEmail')}</dt>
          <dd className="wrap-anywhere">{file.author.email ?? '—'}</dd>
          <dt className="text-muted">{t('authorOrganization')}</dt>
          <dd>{file.author.organization?.name ?? '—'}</dd>
          <dt className="text-muted">{t('fieldsLabel')}</dt>
          <dd>
            {file.fields.map((f) => vocabulary(t, 'field_', f)).join(', ') ||
              '—'}
          </dd>
          <dt className="text-muted">{t('keywordsLabel')}</dt>
          <dd>{file.keywords.join(', ') || '—'}</dd>
          <dt className="text-muted">{t('charterAccepted')}</dt>
          <dd>
            {file.charterAcceptedAt
              ? `${dates.day(file.charterAcceptedAt)} (${file.charterVersion})`
              : '—'}
          </dd>
        </dl>
        {file.coAuthors.length > 0 ? (
          <div className="mt-3">
            <p className="text-sm font-medium text-ink">
              {t('sectionCoAuthors')}
            </p>
            <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-ink-soft">
              {file.coAuthors.map((c, i) => (
                <li key={i}>
                  {[c.name, c.affiliation, c.email].filter(Boolean).join(' · ')}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {file.priorWorks.length > 0 ? (
          <div className="mt-3">
            <p className="text-sm font-medium text-ink">
              {t('priorWorksLabel')}
            </p>
            <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-ink-soft">
              {file.priorWorks.map((w, i) => (
                <li key={i} className="wrap-anywhere">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card id="kohop-history" title={t('history')}>
        <ol className="space-y-2 border-s-2 border-line ps-4">
          {file.events.map((e, i) => (
            <li key={`${e.kind}-${e.at}-${i}`} className="text-sm">
              <span className="font-medium text-ink">
                {vocabulary(t, 'event_', e.kind)}
              </span>
              <span className="ms-2 text-muted">
                {dates.day(e.at)}
                {e.actor ? ` · ${e.actor}` : ''}
              </span>
            </li>
          ))}
        </ol>
        {file.decisions.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm font-medium text-ink">{t('decisions')}</p>
            <ul className="mt-1 space-y-2 text-sm">
              {file.decisions.map((d, i) => (
                <li key={i} className="rounded-sm bg-surface-2 px-3 py-2">
                  <span className="font-medium">
                    {vocabulary(t, 'decision_', d.kind)}
                  </span>
                  {d.reasonCode
                    ? ` (${vocabulary(t, 'reason_', d.reasonCode)})`
                    : ''}
                  {' — '}
                  <span className="whitespace-pre-line text-ink-soft">
                    {d.reason}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

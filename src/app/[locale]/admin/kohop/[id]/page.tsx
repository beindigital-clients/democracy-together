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
  KOHOP_REASON_CODES,
} from '@convex/lib/kohop';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SelectField } from '@/components/ui/choice-fields';
import { FormError } from '@/components/ui/field';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { KohopText } from '@/components/kohop/kohop-text';
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

  const check = reviewer.linkChecks[0];
  const level = check?.level ?? 'none';

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

      {check && check.findings.length > 0 ? (
        <div className="mt-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
            {t('findings')} ·{' '}
            {check.origin === 'ai' ? t('originAi') : t('originRules')} ·{' '}
            {dates.day(check.checkedAt)}
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
      ) : (
        <p className="mt-2 text-sm text-muted">{t('noFindings')}</p>
      )}

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

export default function AdminKohopFile() {
  const t = useTranslations('kohop');
  const dates = useKohopDates();
  const errorMessage = useKohopError();
  const notify = useActionFeedback();
  const params = useParams<{ id: string }>();
  const id = params.id as Id<'kohopContributions'>;
  const file = useQuery(api.kohopChief.dossier, { contributionId: id });
  const startReview = useMutation(api.kohopChief.startReview);
  const giveBack = useMutation(api.kohopChief.returnToAuthor);
  const inadmissible = useMutation(api.kohopChief.declareInadmissible);
  const [dialog, setDialog] = useState<'return' | 'inadmissible' | null>(null);
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
  const startReady = approvedTitulars >= KOHOP_BOUNDS.reviewers.titular;
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
          {canStart && !startReady ? (
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

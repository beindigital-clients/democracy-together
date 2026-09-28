'use client';

import { useState } from 'react';
import { useQuery, useMutation, usePaginatedQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import {
  canTransition,
  MANUSCRIPT_BOUNDS,
  MANUSCRIPT_STAGES,
  type ManuscriptDecision,
  type ManuscriptStage,
} from '@convex/lib/manuscripts';
import { Button } from '@/components/ui/button';
import { SelectField, TextField, TextareaField } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { LoadMore } from '@/components/admin/load-more';
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';
import { intlLocale } from '@/i18n/locale';

type Staff = FunctionReturnType<typeof api.peerReview.listStaffUsers>;
type QueueItem = FunctionReturnType<
  typeof api.peerReview.getReviewQueue
>['page'][number];

const PAGE_SIZE = 20;

// Moment the screen was opened, read once when the module loads and not
// during render: a deadline is judged "overdue" as of that time. The
// queue is loaded client-side, the server rendering shows none of it.
const OPENED_AT = Date.now();
const DECISIONS: ManuscriptDecision[] = ['revision', 'accepted', 'rejected'];
const DECISION_EVENT = {
  revision: 'requestRevision',
  accepted: 'accept',
  rejected: 'reject',
} as const;

function staffName(u: Staff[number]): string {
  return u.name || u.email || u._id;
}

function useDateFormat() {
  const locale = useLocale();
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (ms: number) => fmt.format(ms);
}

// A picker date (YYYY-MM-DD) read as the end of that day, in UTC:
// a deadline "on the 15th" leaves the whole day of the 15th.
function dueFromInput(value: string): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(`${value}T23:59:00Z`);
  return Number.isFinite(ms) ? ms : undefined;
}

// OPEN A REVIEW (27/09 campaign, R-01): a submission awaiting
// moderation, a reviewer, and the review opens — submission then evaluation.
function OpenReviewPanel({ staff }: { staff: Staff | undefined }) {
  const t = useTranslations('admin');
  const openable = useQuery(api.peerReview.listOpenable, {});
  const assign = useMutation(api.peerReview.assignReviewer);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [publicationId, setPublicationId] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [busy, setBusy] = useState(false);

  async function open() {
    const pub = openable?.find((p) => p._id === publicationId);
    const reviewer = staff?.find((u) => u._id === reviewerId);
    if (!pub || !reviewer) return;
    setBusy(true);
    try {
      await assign({ publicationId: pub._id, reviewerUserId: reviewer._id });
      setPublicationId('');
      setReviewerId('');
      notify(
        t('feedbackRevOpened', { title: pub.title, name: staffName(reviewer) }),
      );
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="admin-review-open"
      className="mt-6 rounded-md border border-line bg-surface p-5"
    >
      <h2 id="admin-review-open" className="font-display text-xl">
        {t('revOpenTitle')}
      </h2>
      <p className="mt-1 max-w-[72ch] text-sm text-ink-soft">
        {t('revOpenIntro')}
      </p>
      {openable !== undefined && openable.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('revOpenNoPending')}</p>
      ) : staff !== undefined && staff.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('revNoStaff')}</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <SelectField
            label={t('revOpenPublication')}
            className="min-w-0 flex-1 basis-64"
            value={publicationId}
            onChange={(e) => setPublicationId(e.target.value)}
          >
            <option value="">{t('revOpenPublicationPlaceholder')}</option>
            {(openable ?? []).map((p) => (
              <option key={p._id} value={p._id}>
                {p.title}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('revAssignLabel')}
            className="min-w-0 flex-1 basis-56"
            value={reviewerId}
            onChange={(e) => setReviewerId(e.target.value)}
          >
            <option value="">{t('revAssignPlaceholder')}</option>
            {(staff ?? []).map((u) => (
              <option key={u._id} value={u._id}>
                {staffName(u)}
              </option>
            ))}
          </SelectField>
          <Button
            disabled={busy || !publicationId || !reviewerId}
            onClick={open}
          >
            {t('revOpen')}
          </Button>
        </div>
      )}
    </section>
  );
}

// Full file (versions, response letters, decisions, reviews from each
// round) — loaded only when the editor opens it.
function Dossier({ publicationId }: { publicationId: Id<'publications'> }) {
  const tp = useTranslations('peerReview');
  const t = useTranslations('admin');
  const fmt = useDateFormat();
  const dossier = useQuery(api.peerReview.getManuscriptForEditor, {
    publicationId,
  });
  if (dossier === undefined) {
    return <p className="mt-3 text-sm text-muted">{t('loading')}</p>;
  }
  if (dossier === null) return null;
  return (
    <div className="mt-3 space-y-4">
      <div>
        <h4 className="text-sm font-medium text-ink-soft">
          {tp('versionsTitle')}
        </h4>
        <ol className="mt-2 space-y-2">
          {dossier.versions.map((ver) => (
            <li
              key={ver.version}
              className="rounded border border-line bg-surface-2 p-3 text-sm"
            >
              <p className="font-medium text-ink">
                {tp('versionLabel', { version: ver.version })} —{' '}
                <span className="wrap-anywhere">{ver.title}</span>
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted">
                {tp('submittedOn', { date: fmt(ver.createdAt) })}
              </p>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {ver.fileUrl ? (
                  <a
                    href={ver.fileUrl}
                    className="inline-block py-1 text-accent-text hover:underline"
                  >
                    {tp('originalFile')}
                  </a>
                ) : null}
                {ver.blindFileUrl ? (
                  <a
                    href={ver.blindFileUrl}
                    className="inline-block py-1 text-accent-text hover:underline"
                  >
                    {tp('blindFile')}
                  </a>
                ) : null}
                <span className="py-1 text-muted">
                  {vocabulary(tp, 'blind_', ver.blindStatus)}
                  {ver.strippedFields.length > 0
                    ? ` (${ver.strippedFields.join(', ')})`
                    : ''}
                </span>
              </p>
              {ver.responseLetter ? (
                <details className="mt-2">
                  <summary className="cursor-pointer py-1 text-ink-soft">
                    {tp('responseLetter')}
                  </summary>
                  <p className="mt-1 whitespace-pre-line wrap-anywhere text-ink">
                    {ver.responseLetter}
                  </p>
                </details>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
      {dossier.decisions.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium text-ink-soft">
            {tp('decisionsTitle')}
          </h4>
          <ul className="mt-2 space-y-2">
            {dossier.decisions.map((d, i) => (
              <li
                key={i}
                className="rounded border border-line p-3 text-sm text-ink"
              >
                <p className="font-medium">
                  {tp('versionLabel', { version: d.version })} ·{' '}
                  {vocabulary(tp, 'decision_', d.decision)} · {fmt(d.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-line wrap-anywhere">
                  {d.reason}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {dossier.reviews.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium text-ink-soft">
            {tp('allReviewsTitle')}
          </h4>
          <ul className="mt-2 space-y-2">
            {dossier.reviews.map((r) => (
              <li
                key={r._id}
                className="rounded border border-line p-3 text-sm"
              >
                <p className="font-medium text-ink">
                  {tp('versionLabel', { version: r.version })} ·{' '}
                  {r.reviewerName} ·{' '}
                  {vocabulary(t, 'revRec_', r.recommendation)}
                </p>
                <p className="mt-1 whitespace-pre-line wrap-anywhere text-ink">
                  {r.comment}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ManuscriptCard({
  item,
  staff,
}: {
  item: QueueItem;
  staff: Staff | undefined;
}) {
  const t = useTranslations('admin');
  const tp = useTranslations('peerReview');
  const tl = useTranslations('library');
  const fmt = useDateFormat();
  const assign = useMutation(api.peerReview.assignReviewer);
  const decide = useMutation(api.peerReview.decideManuscript);
  const release = useMutation(api.peerReview.releaseVersionFile);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [reviewerId, setReviewerId] = useState('');
  const [due, setDue] = useState('');
  const [decision, setDecision] = useState<ManuscriptDecision | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDossier, setShowDossier] = useState(false);

  const stage = item.reviewStage;
  const canAssign =
    stage === 'in_review' || canTransition(stage, 'startReview');
  const decisions = DECISIONS.filter((d) =>
    canTransition(stage, DECISION_EVENT[d]),
  );
  const reasonOk =
    reason.trim().length >= MANUSCRIPT_BOUNDS.reason.min &&
    reason.trim().length <= MANUSCRIPT_BOUNDS.reason.max;

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      notify(message);
      return true;
    } catch (err) {
      fail(err);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onAssign() {
    const who = staff?.find((u) => u._id === reviewerId);
    if (!who) return;
    const ok = await run(
      () =>
        assign({
          publicationId: item._id,
          reviewerUserId: who._id,
          dueAt: dueFromInput(due),
        }),
      t('feedbackRevAssigned', { title: item.title, name: staffName(who) }),
    );
    if (ok) {
      setReviewerId('');
      setDue('');
    }
  }

  async function onDecide() {
    if (!decision || !reasonOk) return;
    const ok = await run(
      () =>
        decide({
          publicationId: item._id,
          decision,
          reason: reason.trim(),
        }),
      tp('feedbackDecided', {
        title: item.title,
        decision: vocabulary(tp, 'decision_', decision),
      }),
    );
    if (ok) {
      setDecision('');
      setReason('');
    }
  }

  return (
    <li className="rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 wrap-anywhere font-medium text-ink">
          {item.title}
        </h3>
        <Badge variant="accent">
          {vocabulary(tp, 'stage_', item.reviewStage)}
        </Badge>
        <Badge variant="outline">
          {tp('versionLabel', { version: item.version })}
        </Badge>
        <span className="text-[13px] text-accent-text">
          #{vocabulary(tl, 'themes.', item.theme)}
        </span>
      </div>
      {/* The editor sees the author (double-blind: them alone). */}
      <p className="mt-1 wrap-anywhere text-sm text-ink-soft">
        {tp('authorLabel')} {item.authorName ?? tp('authorUnknown')}
        {item.authorEmail ? ` — ${item.authorEmail}` : ''}
      </p>

      {item.blindStatus ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span
            className={
              item.blindStatus === 'unreadable' ? 'text-bar-5' : 'text-muted'
            }
          >
            {vocabulary(tp, 'blind_', item.blindStatus)}
          </span>
          {item.blindStatus === 'unreadable' ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    release({
                      publicationId: item._id,
                      version: item.version,
                    }),
                  tp('feedbackReleased', { title: item.title }),
                )
              }
            >
              {tp('releaseOriginal')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Manuscript reviewers */}
      <div className="mt-4">
        <h4 className="text-sm font-medium text-ink-soft">
          {tp('reviewersTitle')}
        </h4>
        {item.assignments.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted">{tp('noReviewers')}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {item.assignments.map((a) => (
              <li
                key={a.reviewerUserId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1"
              >
                <span className="font-medium text-ink">{a.reviewerName}</span>
                <span className="text-muted">
                  {tp('versionLabel', { version: a.version })}
                </span>
                <span className="text-ink-soft">
                  {vocabulary(tp, 'conflict_', a.conflict)}
                </span>
                {a.reviewed ? (
                  <span className="text-bar-1">{tp('reviewDone')}</span>
                ) : a.dueAt ? (
                  <span
                    className={
                      a.dueAt < OPENED_AT ? 'text-bar-5' : 'text-muted'
                    }
                  >
                    {tp('dueOn', { date: fmt(a.dueAt) })}
                    {a.remindersSent > 0
                      ? ` · ${tp('remindersSent', { count: a.remindersSent })}`
                      : ''}
                  </span>
                ) : null}
                {a.conflictDetails ? (
                  <span className="basis-full wrap-anywhere text-[13px] text-muted">
                    {a.conflictDetails}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canAssign && staff && staff.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <SelectField
              label={t('revAssignLabel')}
              controlClassName="w-auto"
              value={reviewerId}
              onChange={(e) => setReviewerId(e.target.value)}
            >
              <option value="">{t('revAssignPlaceholder')}</option>
              {staff.map((u) => (
                <option key={u._id} value={u._id}>
                  {staffName(u)}
                </option>
              ))}
            </SelectField>
            <TextField
              type="date"
              label={tp('dueLabel')}
              hint={tp('dueHint')}
              controlClassName="w-auto"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !reviewerId}
              onClick={onAssign}
            >
              {t('revAssign')}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Reviews of the current version */}
      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-medium text-ink-soft">
            {t('revReviewsLabel')}
          </h4>
          {item.aggregate ? (
            <span className="text-[13px] text-muted">
              {t('revAggregateLabel')}{' '}
              <span className="text-ink">
                {vocabulary(t, 'revRec_', item.aggregate)}
              </span>
            </span>
          ) : null}
        </div>
        {item.reviews.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted">{t('revNoReviews')}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {item.reviews.map((r) => (
              <li
                key={r._id}
                className="rounded border border-line bg-surface-2 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-ink">
                    {r.reviewerName}
                  </span>
                  <Badge variant="default">
                    {vocabulary(t, 'revRec_', r.recommendation)}
                  </Badge>
                  <span className="font-mono text-[11px] text-muted">
                    {fmt(r.createdAt)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line wrap-anywhere text-[14px] leading-relaxed text-ink">
                  {r.comment}
                </p>
                {r.commentToEditor ? (
                  <p className="mt-2 whitespace-pre-line wrap-anywhere text-[13px] text-ink-soft">
                    <span className="font-medium">{tp('toEditorLabel')}</span>{' '}
                    {r.commentToEditor}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Reasoned decision */}
      <div className="mt-4 border-t border-line pt-4">
        <h4 className="text-sm font-medium text-ink-soft">
          {t('revDecisionLabel')}
        </h4>
        {decisions.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted">
            {vocabulary(tp, 'noDecision_', item.reviewStage)}
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            <SelectField
              label={tp('decisionLabel')}
              controlClassName="w-auto"
              value={decision}
              onChange={(e) =>
                setDecision(e.target.value as ManuscriptDecision | '')
              }
            >
              <option value="">{tp('decisionPlaceholder')}</option>
              {decisions.map((d) => (
                <option key={d} value={d}>
                  {vocabulary(tp, 'decision_', d)}
                </option>
              ))}
            </SelectField>
            <TextareaField
              label={tp('reasonLabel')}
              hint={tp('reasonHint', { min: MANUSCRIPT_BOUNDS.reason.min })}
              rows={4}
              maxLength={MANUSCRIPT_BOUNDS.reason.max}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              size="sm"
              disabled={busy || !decision || !reasonOk}
              onClick={onDecide}
            >
              {tp('decideSubmit')}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={showDossier}
          onClick={() => setShowDossier((v) => !v)}
        >
          {showDossier ? tp('hideDossier') : tp('showDossier')}
        </Button>
        {showDossier ? <Dossier publicationId={item._id} /> : null}
      </div>
    </li>
  );
}

// PEER REVIEW (F-43) — the EDITOR's screen. The state
// machine, the double-blind and the permissions live on the Convex side
// (convex/peerReview.ts): the screen only offers the transitions the
// machine allows (`canTransition`, the same table), and the server refuses the
// rest. A moderator-rank reviewer goes through "Mes relectures".
export default function AdminReview() {
  const t = useTranslations('admin');
  const tp = useTranslations('peerReview');
  const [stage, setStage] = useState<ManuscriptStage | ''>('');
  const {
    results: queue,
    status,
    loadMore,
  } = usePaginatedQuery(api.peerReview.getReviewQueue, stage ? { stage } : {}, {
    initialNumItems: PAGE_SIZE,
  });
  const staff = useQuery(api.peerReview.listStaffUsers, {});

  return (
    <div id="admin-review">
      <h1 className="font-display text-3xl">{t('revTitle')}</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">{tp('editorIntro')}</p>

      <OpenReviewPanel staff={staff} />

      <h2 className="mt-10 font-display text-xl">{t('revQueueTitle')}</h2>
      <SelectField
        label={t('revStageFilterLabel')}
        labelHidden
        className="mt-4"
        controlClassName="w-auto"
        value={stage}
        onChange={(e) => setStage(e.target.value as ManuscriptStage | '')}
      >
        <option value="">{t('revStageAll')}</option>
        {MANUSCRIPT_STAGES.map((sg) => (
          <option key={sg} value={sg}>
            {vocabulary(tp, 'stage_', sg)}
          </option>
        ))}
      </SelectField>

      {status === 'LoadingFirstPage' ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : queue.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('revEmpty')}</p>
      ) : (
        <ul aria-label={t('revQueueTitle')} className="mt-6 space-y-4">
          {queue.map((p) => (
            <ManuscriptCard key={p._id} item={p} staff={staff} />
          ))}
        </ul>
      )}

      <LoadMore status={status} loadMore={loadMore} pageSize={PAGE_SIZE} />
    </div>
  );
}

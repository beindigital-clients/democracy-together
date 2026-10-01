'use client';

import { useId, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { MANUSCRIPT_BOUNDS } from '@convex/lib/manuscripts';
import { Button } from '@/components/ui/button';
import { TextareaField } from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  useActionFeedback,
  useFailureFeedback,
} from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';
import { intlLocale } from '@/i18n/locale';

type Recommendation = 'accept' | 'minor' | 'major' | 'reject';
const RECOMMENDATIONS: Recommendation[] = [
  'accept',
  'minor',
  'major',
  'reject',
];
type Assignment = FunctionReturnType<
  typeof api.peerReview.myAssignments
>[number];

// Moment the screen was opened (read when the module loads, not during
// render): used to flag an overdue deadline.
const OPENED_AT = Date.now();

function useDateFormat() {
  const locale = useLocale();
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (ms: number) => fmt.format(ms);
}

// Conflict of interest declaration: a PREREQUISITE for everything else. The server
// only returns the file and accepts the review once the declaration is made.
function ConflictForm({
  publicationId,
}: {
  publicationId: Id<'publications'>;
}) {
  const tp = useTranslations('peerReview');
  const declare = useMutation(api.peerReview.declareConflict);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [choice, setChoice] = useState<'clear' | 'conflict' | ''>('');
  const legendId = useId();
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!choice) return;
    setBusy(true);
    try {
      await declare({
        publicationId,
        hasConflict: choice === 'conflict',
        details: details.trim() || undefined,
      });
      notify(
        choice === 'conflict'
          ? tp('feedbackRecused')
          : tp('feedbackConflictClear'),
      );
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="mt-4 rounded border border-accent-edge bg-accent-tint p-4">
      <legend id={legendId} className="px-1 text-sm font-medium text-ink">
        {tp('conflictTitle')}
      </legend>
      <p className="text-sm text-ink-soft">{tp('conflictIntro')}</p>
      <RadioGroup
        name={`conflict-${publicationId}`}
        aria-labelledby={legendId}
        value={choice}
        onValueChange={(v) =>
          setChoice(v === 'conflict' ? 'conflict' : 'clear')
        }
        className="mt-3 gap-2"
      >
        {(['clear', 'conflict'] as const).map((c) => (
          <label
            key={c}
            className="flex min-h-11 items-center gap-3 text-sm text-ink"
          >
            <RadioGroupItem value={c} />
            {c === 'clear' ? tp('conflictNone') : tp('conflictYes')}
          </label>
        ))}
      </RadioGroup>
      {choice === 'conflict' ? (
        <TextareaField
          label={tp('conflictDetails')}
          className="mt-2"
          rows={2}
          maxLength={MANUSCRIPT_BOUNDS.conflictDetails.max}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      ) : null}
      <Button
        size="sm"
        className="mt-3"
        disabled={busy || !choice}
        onClick={submit}
      >
        {tp('conflictSubmit')}
      </Button>
    </fieldset>
  );
}

function ReviewForm({
  publicationId,
  title,
}: {
  publicationId: Id<'publications'>;
  title: string;
}) {
  const t = useTranslations('admin');
  const tp = useTranslations('peerReview');
  const submit = useMutation(api.peerReview.submitReview);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();
  const [recommendation, setRecommendation] = useState<Recommendation>('minor');
  const [comment, setComment] = useState('');
  const [toEditor, setToEditor] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = comment.trim().length >= MANUSCRIPT_BOUNDS.comment.min;

  async function onSubmit() {
    if (!ok) return;
    setBusy(true);
    try {
      await submit({
        publicationId,
        recommendation,
        comment: comment.trim(),
        commentToEditor: toEditor.trim() || undefined,
      });
      setComment('');
      setToEditor('');
      notify(t('feedbackRevSubmitted', { title }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded border border-line p-4">
      <h3 className="text-sm font-medium text-ink-soft">
        {t('revSubmitLabel')}
      </h3>
      <SelectField
        label={t('revRecommendationLabel')}
        className="mt-2"
        controlClassName="w-auto"
        value={recommendation}
        onValueChange={(v) => setRecommendation(v as Recommendation)}
        options={RECOMMENDATIONS.map((rec) => ({
          value: rec,
          label: vocabulary(t, 'revRec_', rec),
        }))}
      />
      <TextareaField
        label={tp('commentToAuthor')}
        hint={t('revCommentHint')}
        className="mt-2"
        rows={6}
        maxLength={MANUSCRIPT_BOUNDS.comment.max}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <TextareaField
        label={tp('commentToEditor')}
        hint={tp('commentToEditorHint')}
        className="mt-2"
        rows={3}
        maxLength={MANUSCRIPT_BOUNDS.commentToEditor.max}
        value={toEditor}
        onChange={(e) => setToEditor(e.target.value)}
      />
      <Button
        size="sm"
        className="mt-3"
        disabled={busy || !ok}
        onClick={onSubmit}
      >
        {t('revSubmit')}
      </Button>
    </div>
  );
}

// The manuscript as its reviewer sees it: version under review, what has
// changed since the previous one, response letter, ANONYMIZED file. Nothing
// in it names the author — the server guarantees it (convex/peerReview.ts).
function AssignmentDetail({ item }: { item: Assignment }) {
  const t = useTranslations('admin');
  const tp = useTranslations('peerReview');
  const fmt = useDateFormat();
  const view = useQuery(api.peerReview.getAssignment, {
    publicationId: item._id,
  });
  if (view === undefined) {
    return <p className="mt-3 text-sm text-muted">{t('loading')}</p>;
  }
  if (view === null) return null;

  return (
    <div className="mt-4 space-y-4">
      {view.conflict === 'undeclared' && view.reviewStage === 'in_review' ? (
        <ConflictForm publicationId={view.publicationId} />
      ) : null}
      {view.conflict === 'conflict' ? (
        <p className="rounded border border-line bg-surface-2 p-3 text-sm text-ink-soft">
          {tp('recusedNotice')}
        </p>
      ) : null}

      <div>
        <h3 className="text-sm font-medium text-ink-soft">
          {tp('abstractLabel')}
        </h3>
        <p className="mt-1 max-w-[70ch] whitespace-pre-line wrap-anywhere text-[15px] leading-relaxed text-ink">
          {view.abstract}
        </p>
        {view.keywords.length > 0 ? (
          <p className="mt-2 flex flex-wrap gap-2">
            {view.keywords.map((k) => (
              <Badge key={k} variant="default">
                {k}
              </Badge>
            ))}
          </p>
        ) : null}
      </div>

      {view.conflict === 'clear' ? (
        <div className="text-sm">
          {view.file.url ? (
            <a
              href={view.file.url}
              download={view.file.name ?? undefined}
              className="inline-flex min-h-11 items-center rounded-sm border border-line-strong px-4 font-medium text-ink hover:bg-surface-2"
            >
              {tp('downloadBlind', { name: view.file.name ?? '' })}
            </a>
          ) : view.file.blindStatus ? (
            <p className="text-muted">
              {vocabulary(tp, 'reviewerFile_', view.file.blindStatus)}
            </p>
          ) : null}
          {view.file.url ? (
            <p className="mt-1 text-[13px] text-muted">{tp('blindNotice')}</p>
          ) : null}
        </div>
      ) : null}

      {view.diff ? (
        <div className="rounded border border-line bg-surface-2 p-3 text-sm">
          <h3 className="font-medium text-ink">
            {tp('diffTitle', { from: view.diff.fromVersion, to: view.version })}
          </h3>
          <ul className="mt-2 space-y-1 text-ink-soft">
            {view.diff.title ? (
              <li className="wrap-anywhere">
                {tp('diffTitleChanged', {
                  from: view.diff.title.from,
                  to: view.diff.title.to,
                })}
              </li>
            ) : null}
            {view.diff.abstract ? <li>{tp('diffAbstractChanged')}</li> : null}
            {view.diff.keywordsAdded.length > 0 ? (
              <li className="wrap-anywhere">
                {tp('diffKeywordsAdded', {
                  list: view.diff.keywordsAdded.join(', '),
                })}
              </li>
            ) : null}
            {view.diff.keywordsRemoved.length > 0 ? (
              <li className="wrap-anywhere">
                {tp('diffKeywordsRemoved', {
                  list: view.diff.keywordsRemoved.join(', '),
                })}
              </li>
            ) : null}
            {view.diff.fileReplaced ? <li>{tp('diffFileReplaced')}</li> : null}
          </ul>
        </div>
      ) : null}

      {view.responseLetter ? (
        <div>
          <h3 className="text-sm font-medium text-ink-soft">
            {tp('responseLetter')}
          </h3>
          <p className="mt-1 max-w-[70ch] whitespace-pre-line wrap-anywhere text-[15px] leading-relaxed text-ink">
            {view.responseLetter}
          </p>
        </div>
      ) : null}

      {view.myReviews.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-ink-soft">
            {t('myRevMine')}
          </h3>
          <ul className="mt-2 space-y-2">
            {view.myReviews.map((r) => (
              <li
                key={r.version}
                className="rounded border border-line bg-surface-2 p-3 text-sm"
              >
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">
                    {tp('versionLabel', { version: r.version })}
                  </span>
                  <Badge variant="default">
                    {vocabulary(t, 'revRec_', r.recommendation)}
                  </Badge>
                  <span className="font-mono text-[11px] text-muted">
                    {t('myRevSubmittedOn', { date: fmt(r.createdAt) })}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-line wrap-anywhere text-ink">
                  {r.comment}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.open ? (
        <ReviewForm publicationId={view.publicationId} title={view.title} />
      ) : null}
    </div>
  );
}

// MY REVIEWS (27/09 campaign, A-02; F-43 editorial workstream). Open
// to moderator rank, it returns ONLY the signed-in account's assignments
// (`myAssignments` reads the identity from the session). The full queue, the
// assignments and the decisions stay in "Comité de lecture".
export default function AdminMyReviews() {
  const t = useTranslations('admin');
  const tp = useTranslations('peerReview');
  const tl = useTranslations('library');
  const fmt = useDateFormat();
  const items = useQuery(api.peerReview.myAssignments, {});
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div id="admin-my-reviews">
      <h1 className="font-display text-3xl">{t('myRevTitle')}</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">{tp('reviewerIntro')}</p>

      {items === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('myRevEmpty')}</p>
      ) : (
        <ul aria-label={t('myRevTitle')} className="mt-6 space-y-4">
          {items.map((p) => {
            const expanded = openId === p._id;
            const detailId = `review-detail-${p._id}`;
            return (
              <li
                key={p._id}
                className="rounded-md border border-line bg-surface p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="min-w-0 wrap-anywhere font-medium text-ink">
                    {p.title}
                  </h2>
                  <Badge variant={p.open ? 'accent' : 'default'}>
                    {vocabulary(tp, 'stage_', p.reviewStage)}
                  </Badge>
                  <Badge variant="outline">
                    {tp('versionLabel', { version: p.version })}
                  </Badge>
                  <span className="text-[13px] text-accent-text">
                    #{vocabulary(tl, 'themes.', p.theme)}
                  </span>
                </div>
                <p className="mt-1 flex flex-wrap gap-x-4 font-mono text-[11px] text-muted">
                  <span>
                    {t('myRevAssignedOn', { date: fmt(p.assignedAt) })}
                  </span>
                  {p.dueAt ? (
                    <span
                      className={p.dueAt < OPENED_AT ? 'text-bar-5' : undefined}
                    >
                      {tp('dueOn', { date: fmt(p.dueAt) })}
                    </span>
                  ) : null}
                </p>
                <p className="mt-2 text-sm text-ink-soft">
                  {p.myReview
                    ? tp('statusReviewed')
                    : p.conflict === 'conflict'
                      ? tp('statusRecused')
                      : p.conflict === 'undeclared' &&
                          p.reviewStage === 'in_review'
                        ? tp('statusDeclare')
                        : p.open
                          ? tp('statusToReview')
                          : t('myRevClosed')}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  aria-expanded={expanded}
                  aria-controls={detailId}
                  onClick={() => setOpenId(expanded ? null : p._id)}
                >
                  {expanded ? tp('hideManuscript') : tp('openManuscript')}
                </Button>
                <div id={detailId}>
                  {expanded ? <AssignmentDetail item={p} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

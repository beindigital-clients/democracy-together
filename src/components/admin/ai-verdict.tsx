'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Badge } from '@/components/ui/badge';
import { vocabulary } from '@/i18n/vocabulary';
import { Button } from '@/components/ui/button';

// AI OPINION IN THE MODERATION QUEUE.
//
// This component upholds a simple requirement that is easy to miss: a
// moderator must be able to CONTRADICT the opinion effortlessly. Three
// display decisions follow from it.
//
//  1. SUMMARY FIRST, DETAILS ON DEMAND. The badge and one sentence
//     suffice for most rows; the signals only load when opened
//     (`aiModeration.getReview` is only called then).
//     That is also what keeps the queue light: a hundred rows do not call
//     a hundred full reviews.
//  2. EACH SIGNAL QUOTES ITS EXCERPT. A finding without a quote requires
//     rereading the whole submission to be verified — so it won't be verified.
//  3. NO LANGUAGE OF AUTHORITY. "Opinion", "signal", "to look at"; never
//     "rejected by the AI". What is written on screen ends up describing what
//     people believe the tool does.

type AiSummary = {
  verdict: 'approve' | 'flag' | 'reject' | 'error';
  applied: 'published' | 'escalated' | 'shadow' | 'superseded';
  reason: string;
  confidence: number;
  blocking: number;
  warnings: number;
  at: number;
};

function verdictVariant(verdict: AiSummary['verdict']) {
  return verdict === 'approve' ? 'accent' : 'default';
}

function AiVerdictBadges({ review }: { review: AiSummary }) {
  const t = useTranslations('admin');
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Badge variant={verdictVariant(review.verdict)}>
        {vocabulary(t, 'aiVerdict_', review.verdict)}
      </Badge>
      <span className="text-xs text-muted">
        {vocabulary(t, 'aiApplied_', review.applied)}
        {review.verdict === 'error'
          ? ''
          : ` · ${t('aiConfidenceValue', { value: review.confidence })}`}
      </span>
      {review.blocking + review.warnings > 0 ? (
        <span className="text-xs text-muted">
          {t('aiSignalsCount', {
            blocking: review.blocking,
            warnings: review.warnings,
          })}
        </span>
      ) : null}
    </span>
  );
}

// Details of an opinion — loaded only when opened.
function AiVerdictDetails({
  publicationId,
}: {
  publicationId: Id<'publications'>;
}) {
  const t = useTranslations('admin');
  const review = useQuery(api.aiModeration.getReview, { publicationId });

  if (review === undefined)
    return <p className="mt-2 text-xs text-muted">{t('aiLoadingReview')}</p>;
  if (review === null)
    return <p className="mt-2 text-xs text-muted">{t('aiNoReview')}</p>;

  // Only findings that SAY something are listed. Showing the twenty
  // "satisfied" items of a supplied rubric would drown the two that matter;
  // the badge already carries the full count.
  const signals = review.findings.filter((f) => f.outcome !== 'pass');

  return (
    <div className="mt-3 rounded-sm border border-line bg-surface-2 p-3">
      {review.summary ? (
        <p className="max-w-[72ch] text-sm leading-relaxed text-ink-soft">
          {review.summary}
        </p>
      ) : null}
      {review.error ? (
        <p className="mt-2 text-xs text-muted">
          {t('aiTestError', { code: review.error })}
        </p>
      ) : null}

      {signals.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {signals.map((f) => (
            <li key={f.ruleKey} className="text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={f.severity === 'blocking' ? 'accent' : 'default'}
                >
                  {vocabulary(t, 'aiSeverity_', f.severity)}
                </Badge>
                <span className="font-medium">{f.ruleLabel}</span>
                <span className="text-xs text-muted">
                  {vocabulary(t, 'aiOutcome_', f.outcome)}
                </span>
              </span>
              <p className="mt-1 max-w-[72ch] text-sm text-ink-soft">
                {f.explanation}
              </p>
              {f.quote ? (
                <blockquote className="mt-1 border-s-2 border-line ps-3 text-xs italic text-muted">
                  {f.quote}
                </blockquote>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 text-xs text-muted">
        {t('aiModelUsed', { model: review.model })}
      </p>
    </div>
  );
}

export function AiVerdictPanel({
  publicationId,
  review,
}: {
  publicationId: Id<'publications'>;
  review: AiSummary | null;
}) {
  const t = useTranslations('admin');
  const [open, setOpen] = useState(false);

  if (!review) return null;

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          {t('aiVerdictTitle')}
        </span>
        <AiVerdictBadges review={review} />
        <Button
          type="button"
          variant="link"
          size="inline"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-xs"
        >
          {open ? t('aiHideDetails') : t('aiShowDetails')}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted">
        {vocabulary(t, 'aiReason_', review.reason)}
      </p>
      {open ? <AiVerdictDetails publicationId={publicationId} /> : null}
    </div>
  );
}

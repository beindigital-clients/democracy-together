'use client';

import { useMemo, useState } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import {
  KOHOP_BOUNDS,
  KOHOP_RECOMMENDATIONS,
  type KohopRecommendation,
} from '@convex/lib/kohop';
import { countWords } from '@convex/lib/kohopText';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FormError, TextareaField } from '@/components/ui/field';
import { vocabulary } from '@/i18n/vocabulary';
import { WordCounter } from './markdown-editor';
import { useKohopError } from './use-kohop';

// THE ANALYSIS (K-14): a recommendation, a public text of 150 to 1 500 words
// in plain text, and a confidential note for the review chief. The same
// `countWords` as the server, so the counter never disagrees with a refusal.

export function ReviewForm({
  reviewerId,
  initial,
  editable,
}: {
  reviewerId: Id<'kohopReviewers'>;
  initial: {
    recommendation: KohopRecommendation;
    analysis: string;
    noteToEditor: string;
  } | null;
  editable: boolean;
}) {
  const t = useTranslations('kohop');
  const errorMessage = useKohopError();
  const save = useMutation(api.kohopReviews.saveReview);
  const [recommendation, setRecommendation] = useState<
    KohopRecommendation | ''
  >(initial?.recommendation ?? '');
  const [analysis, setAnalysis] = useState(initial?.analysis ?? '');
  const [note, setNote] = useState(initial?.noteToEditor ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const words = useMemo(() => countWords(analysis), [analysis]);
  const bounds = KOHOP_BOUNDS.analysisWords;
  const ready =
    recommendation !== '' && words >= bounds.min && words <= bounds.max;

  async function submit() {
    if (recommendation === '') return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await save({
        reviewerId,
        recommendation,
        analysis,
        noteToEditor: note.trim() || undefined,
      });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="kohop-analysis"
      className="rounded-md border border-line bg-surface p-5 sm:p-6"
    >
      <h2 id="kohop-analysis" className="font-display text-xl text-ink">
        {t('analysisTitle')}
      </h2>
      <p className="mt-1 max-w-[62ch] text-sm text-ink-soft">
        {t('analysisLead')}
      </p>

      <fieldset className="mt-5" disabled={!editable}>
        <legend className="text-sm font-medium text-ink">
          {t('recommendationLegend')}
        </legend>
        <RadioGroup
          name="kohop-recommendation"
          value={recommendation}
          onValueChange={(v) => {
            const found = KOHOP_RECOMMENDATIONS.find((r) => r === v);
            if (found) setRecommendation(found);
          }}
          className="mt-2 gap-1"
        >
          {KOHOP_RECOMMENDATIONS.map((r) => (
            <label
              key={r}
              className="flex min-h-11 items-center gap-3 text-sm text-ink"
            >
              <RadioGroupItem value={r} />
              {vocabulary(t, 'rec_', r)}
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="mt-5 space-y-2">
        <TextareaField
          label={t('analysisLabel')}
          hint={t('analysisHint')}
          rows={14}
          disabled={!editable}
          value={analysis}
          onChange={(e) => setAnalysis(e.target.value)}
        />
        <WordCounter
          id="kohop-analysis-count"
          words={words}
          min={bounds.min}
          max={bounds.max}
        />
      </div>

      <div className="mt-5">
        <TextareaField
          label={t('noteLabel')}
          hint={t('noteHint')}
          rows={3}
          maxLength={KOHOP_BOUNDS.noteToEditor.max}
          disabled={!editable}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <FormError className="mt-3">{error}</FormError>
      {saved ? (
        <p role="status" className="mt-3 text-sm text-bar-1">
          {t('reviewSaved')}
        </p>
      ) : null}
      {editable ? (
        <Button
          type="button"
          className="mt-4"
          disabled={busy || !ready}
          onClick={submit}
        >
          {initial ? t('updateReview') : t('submitReview')}
        </Button>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">{t('reviewLocked')}</p>
      )}
    </section>
  );
}

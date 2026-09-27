'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { SelectField, TextareaField } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
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

// MES RELECTURES (campagne du 27/09, A-02). Le relecteur désigné par un
// éditeur est souvent un MODÉRATEUR : `submitReview` accepte ce rang, mais la
// notification l'envoyait sur `/admin/revue`, dont la file exige l'éditeur —
// page d'erreur, avis impossible à déposer. Cette vue est ouverte au rang
// modérateur et ne rend QUE ses assignations (`myAssignments` lit l'identité
// dans la session). La file complète, l'assignation et les décisions restent
// dans « Comité de lecture », réservé à l'éditeur.
export default function AdminMyReviews() {
  const t = useTranslations('admin');
  const tl = useTranslations('library');
  const locale = useLocale();
  const items = useQuery(api.peerReview.myAssignments, {});
  const submit = useMutation(api.peerReview.submitReview);
  const notify = useActionFeedback();
  const fail = useFailureFeedback();

  const [recommendation, setRecommendation] = useState<
    Record<string, Recommendation>
  >({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const fmt = (ms: number) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  async function onSubmit(pubId: string, title: string) {
    const text = (comment[pubId] ?? '').trim();
    if (text.length < 10) return;
    setBusy(pubId);
    try {
      await submit({
        publicationId: pubId as Id<'publications'>,
        recommendation: recommendation[pubId] ?? 'accept',
        comment: text,
      });
      setComment((c) => ({ ...c, [pubId]: '' }));
      notify(t('feedbackRevSubmitted', { title }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div id="admin-my-reviews">
      <h1 className="font-display text-3xl">{t('myRevTitle')}</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">{t('myRevIntro')}</p>

      {items === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('myRevEmpty')}</p>
      ) : (
        <ul aria-label={t('myRevTitle')} className="mt-6 space-y-4">
          {items.map((p) => (
            <li
              key={p._id}
              className="rounded-md border border-line bg-surface p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 wrap-anywhere font-medium text-ink">
                  {p.title}
                </h2>
                <Badge
                  variant={p.reviewStage === 'in_review' ? 'accent' : 'default'}
                >
                  {vocabulary(t, 'revStage_', p.reviewStage)}
                </Badge>
                <span className="text-accent-text text-[13px]">
                  #{vocabulary(tl, 'themes.', p.theme)}
                </span>
              </div>
              <p className="mt-1 font-mono text-[11px] text-muted">
                {t('myRevAssignedOn', { date: fmt(p.assignedAt) })}
              </p>

              {p.myReview ? (
                // L'avis déposé reste visible : un relecteur ne pèse qu'une
                // fois (issue #9), le formulaire ne revient donc pas.
                <div className="mt-4 rounded border border-line bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink-soft">
                      {t('myRevMine')}
                    </span>
                    <Badge variant="default">
                      {vocabulary(t, 'revRec_', p.myReview.recommendation)}
                    </Badge>
                    <span className="font-mono text-[11px] text-muted">
                      {t('myRevSubmittedOn', {
                        date: fmt(p.myReview.createdAt),
                      })}
                    </span>
                  </div>
                  <p className="mt-1 wrap-anywhere text-[14px] leading-relaxed text-ink">
                    {p.myReview.comment}
                  </p>
                </div>
              ) : p.reviewStage !== 'in_review' ? (
                <p className="mt-3 text-[13px] text-muted">
                  {t('myRevClosed')}
                </p>
              ) : (
                <div className="mt-4 rounded border border-line p-3">
                  <h3 className="text-sm font-medium text-ink-soft">
                    {t('revSubmitLabel')}
                  </h3>
                  <SelectField
                    label={t('revRecommendationLabel')}
                    className="mt-2"
                    controlClassName="w-auto"
                    value={recommendation[p._id] ?? 'accept'}
                    onChange={(e) =>
                      setRecommendation((s) => ({
                        ...s,
                        [p._id]: e.target.value as Recommendation,
                      }))
                    }
                  >
                    {RECOMMENDATIONS.map((rec) => (
                      <option key={rec} value={rec}>
                        {vocabulary(t, 'revRec_', rec)}
                      </option>
                    ))}
                  </SelectField>
                  <TextareaField
                    label={t('revSubmitLabel')}
                    labelHidden
                    hint={t('revCommentHint')}
                    className="mt-2"
                    value={comment[p._id] ?? ''}
                    onChange={(e) =>
                      setComment((c) => ({ ...c, [p._id]: e.target.value }))
                    }
                    rows={4}
                    placeholder={t('revCommentPlaceholder')}
                  />
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={
                      busy === p._id ||
                      (comment[p._id] ?? '').trim().length < 10
                    }
                    onClick={() => onSubmit(p._id, p.title)}
                  >
                    {t('revSubmit')}
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

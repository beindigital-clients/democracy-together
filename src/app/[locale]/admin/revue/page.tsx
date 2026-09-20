'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { SelectField, TextareaField } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';

type Recommendation = 'accept' | 'minor' | 'major' | 'reject';
const RECOMMENDATIONS: Recommendation[] = [
  'accept',
  'minor',
  'major',
  'reject',
];

// Revue à comité de lecture (F-43) — RÉSERVÉE AU STAFF. Surcouche de la
// modération : les relecteurs (modérateur+) déposent un avis, l'éditeur arbitre
// (assignation, décision revision/reviewed). La file `getReviewQueue` et les
// actions d'arbitrage exigent le rôle éditeur côté serveur (défense en
// profondeur) ; ici on s'appuie sur le même garde-fou que l'onglet (isEditor).
export default function AdminReview() {
  const t = useTranslations('admin');
  const tl = useTranslations('library');
  const locale = useLocale();
  const queue = useQuery(api.peerReview.getReviewQueue, {});
  const staff = useQuery(api.peerReview.listStaffUsers, {});
  const assign = useMutation(api.peerReview.assignReviewer);
  const submit = useMutation(api.peerReview.submitReview);
  const decide = useMutation(api.peerReview.decideReview);

  // États de formulaire indexés par publication (chaque carte est autonome).
  const [reviewer, setReviewer] = useState<Record<string, string>>({});
  const [recommendation, setRecommendation] = useState<
    Record<string, Recommendation>
  >({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const fmt = (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  async function onAssign(pubId: string) {
    const uid = reviewer[pubId];
    if (!uid) return;
    setBusy(`assign:${pubId}`);
    try {
      await assign({
        publicationId: pubId as Id<'publications'>,
        reviewerUserId: uid as Id<'users'>,
      });
      setReviewer((r) => ({ ...r, [pubId]: '' }));
    } catch {
      /* refusé côté serveur (rôle) : la file se rafraîchit toute seule */
    } finally {
      setBusy(null);
    }
  }

  async function onSubmitReview(pubId: string) {
    const text = (comment[pubId] ?? '').trim();
    if (text.length < 10) return;
    setBusy(`review:${pubId}`);
    try {
      await submit({
        publicationId: pubId as Id<'publications'>,
        recommendation: recommendation[pubId] ?? 'accept',
        comment: text,
      });
      setComment((c) => ({ ...c, [pubId]: '' }));
    } catch {
      /* idem */
    } finally {
      setBusy(null);
    }
  }

  async function onDecide(pubId: string, decision: 'revision' | 'reviewed') {
    setBusy(`decide:${pubId}`);
    try {
      await decide({
        publicationId: pubId as Id<'publications'>,
        decision,
      });
    } catch {
      /* idem */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div id="admin-review">
      <h1 className="font-display text-3xl">{t('revTitle')}</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">{t('revIntro')}</p>

      {queue === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : queue.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('revEmpty')}</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {queue.map((p) => (
            <li
              key={p._id}
              className="rounded-md border border-line bg-surface p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium text-ink">{p.title}</h2>
                <Badge variant="accent">{t(`revStage_${p.reviewStage}`)}</Badge>
                <span className="text-accent-text text-[13px]">
                  #{tl(`themes.${p.theme}`)}
                </span>
              </div>

              {/* Avis des relecteurs + recommandation agrégée */}
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-ink-soft">
                    {t('revReviewsLabel')}
                  </h3>
                  {p.aggregate ? (
                    <span className="text-[13px] text-muted">
                      {t('revAggregateLabel')}{' '}
                      <span className="text-ink">
                        {t(`revRec_${p.aggregate}`)}
                      </span>
                    </span>
                  ) : null}
                </div>
                {p.reviews.length === 0 ? (
                  <p className="mt-2 text-[13px] text-muted">
                    {t('revNoReviews')}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {p.reviews.map((r) => (
                      <li
                        key={r._id}
                        className="rounded border border-line bg-surface-2 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-medium text-ink">
                            {r.reviewerName}
                          </span>
                          <Badge variant="default">
                            {t(`revRec_${r.recommendation}`)}
                          </Badge>
                          <span className="font-mono text-[11px] text-muted">
                            {fmt(r.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-[14px] leading-relaxed text-ink">
                          {r.comment}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Déposer un avis (relecteur = modérateur+) */}
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
                      {t(`revRec_${rec}`)}
                    </option>
                  ))}
                </SelectField>
                <TextareaField
                  label={t('revSubmitLabel')}
                  labelHidden
                  className="mt-2"
                  value={comment[p._id] ?? ''}
                  onChange={(e) =>
                    setComment((c) => ({ ...c, [p._id]: e.target.value }))
                  }
                  rows={3}
                  placeholder={t('revCommentPlaceholder')}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={
                    busy === `review:${p._id}` ||
                    (comment[p._id] ?? '').trim().length < 10
                  }
                  onClick={() => onSubmitReview(p._id)}
                >
                  {t('revSubmit')}
                </Button>
              </div>

              {/* Arbitrage éditeur : assignation + décision */}
              <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
                <div>
                  {staff !== undefined && staff.length === 0 ? (
                    <>
                      <p className="text-sm text-ink-soft">
                        {t('revAssignLabel')}
                      </p>
                      <p className="mt-1 text-[13px] text-muted">
                        {t('revNoStaff')}
                      </p>
                    </>
                  ) : (
                    <div className="flex flex-wrap items-end gap-2">
                      <SelectField
                        label={t('revAssignLabel')}
                        controlClassName="w-auto"
                        value={reviewer[p._id] ?? ''}
                        onChange={(e) =>
                          setReviewer((r) => ({
                            ...r,
                            [p._id]: e.target.value,
                          }))
                        }
                      >
                        <option value="">{t('revAssignPlaceholder')}</option>
                        {(staff ?? []).map((u) => (
                          <option key={u._id} value={u._id}>
                            {u.name || u.email || u._id}
                          </option>
                        ))}
                      </SelectField>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          busy === `assign:${p._id}` || !reviewer[p._id]
                        }
                        onClick={() => onAssign(p._id)}
                      >
                        {t('revAssign')}
                      </Button>
                    </div>
                  )}
                </div>
                <span className="flex-1" />
                <div>
                  <p className="text-[13px] text-ink-soft">
                    {t('revDecisionLabel')}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === `decide:${p._id}`}
                      onClick={() => onDecide(p._id, 'revision')}
                    >
                      {t('revDecideRevision')}
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy === `decide:${p._id}`}
                      onClick={() => onDecide(p._id, 'reviewed')}
                    >
                      {t('revDecideReviewed')}
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

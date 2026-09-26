'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Badge } from '@/components/ui/badge';
import { vocabulary } from '@/i18n/vocabulary';

// AVIS DE L'IA DANS LA FILE DE MODÉRATION.
//
// Ce composant tient une exigence simple et facile à rater : un modérateur
// doit pouvoir CONTREDIRE l'avis sans effort. Trois décisions d'affichage en
// découlent.
//
//  1. LE RÉSUMÉ D'ABORD, LE DÉTAIL SUR DEMANDE. Le badge et une phrase
//     suffisent à la plupart des lignes ; les signaux ne se chargent que
//     lorsqu'on les ouvre (`aiModeration.getReview` n'est appelée qu'alors).
//     C'est aussi ce qui garde la file légère : cent lignes n'appellent pas
//     cent avis complets.
//  2. CHAQUE SIGNAL CITE SON EXTRAIT. Un constat sans citation demande de
//     relire le dépôt entier pour être vérifié — donc ne sera pas vérifié.
//  3. AUCUN LANGAGE D'AUTORITÉ. « Avis », « signal », « à regarder » ; jamais
//     « refusé par l'IA ». Ce qui est écrit à l'écran finit par décrire ce que
//     les gens croient que l'outil fait.

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

// Détail d'un avis — chargé seulement à l'ouverture.
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

  // Seuls les constats qui DISENT quelque chose sont listés. Afficher les
  // vingt « satisfait » d'un barème fourni noierait les deux qui comptent ;
  // le badge, lui, porte déjà le compte complet.
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
                <blockquote className="mt-1 border-l-2 border-line pl-3 text-xs italic text-muted">
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
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-xs font-medium text-accent-text hover:underline"
        >
          {open ? t('aiHideDetails') : t('aiShowDetails')}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        {vocabulary(t, 'aiReason_', review.reason)}
      </p>
      {open ? <AiVerdictDetails publicationId={publicationId} /> : null}
    </div>
  );
}

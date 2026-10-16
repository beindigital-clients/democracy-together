'use client';

import { useTranslations } from 'next-intl';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { vocabulary } from '@/i18n/vocabulary';
import { KohopText } from './kohop-text';

// The analyses of the reviewers: signed, with their recommendation. The
// confidential note is passed ONLY by the review chief's screen.

type Review = {
  recommendation: string;
  analysis: string;
  displayName: string;
  affiliation: string | null;
  noteToEditor?: string | null;
};

const VARIANT: Record<string, BadgeVariant> = {
  favorable: 'good',
  reserves: 'pending',
  defavorable: 'bad',
};

export function ReviewsList({
  reviews,
  lang,
}: {
  reviews: Review[];
  lang: string;
}) {
  const t = useTranslations('kohop');
  return (
    <ul className="space-y-4">
      {reviews.map((r, i) => (
        <li
          key={`${r.displayName}-${i}`}
          className="rounded-md border border-line bg-surface p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="wrap-anywhere font-medium text-ink">
                {r.displayName}
              </p>
              {r.affiliation ? (
                <p className="text-sm text-ink-soft">{r.affiliation}</p>
              ) : null}
            </div>
            <Badge
              variant={VARIANT[r.recommendation] ?? 'default'}
              size="label"
            >
              {vocabulary(t, 'rec_', r.recommendation)}
            </Badge>
          </div>
          <div className="mt-3">
            <KohopText markdown={r.analysis} lang={lang} />
          </div>
          {r.noteToEditor ? (
            <div className="mt-4 rounded-md border border-accent-edge bg-accent-tint p-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                {t('confidentialNote')}
              </p>
              <p className="mt-1 whitespace-pre-line wrap-anywhere text-sm text-ink">
                {r.noteToEditor}
              </p>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

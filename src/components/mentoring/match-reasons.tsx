'use client';

import { useTranslations } from 'next-intl';
import { vocabulary } from '@/i18n/vocabulary';
import type { MatchReason } from '@convex/lib/programmes';

// The EXPLAINED matching score (F-59): one line per component, with the
// points it contributes. It is what the coordinator reads before deciding,
// and what the pair finds later ("why us?").
export function MatchReasons({
  score,
  reasons,
}: {
  score: number;
  reasons: unknown;
}) {
  const t = useTranslations('mentorship');
  const tl = useTranslations('library');
  const list = Array.isArray(reasons) ? (reasons as MatchReason[]) : [];
  const line = (r: MatchReason): string => {
    switch (r.kind) {
      case 'themes':
        return r.values.length
          ? t('reasonThemes', {
              values: r.values
                .map((v) => vocabulary(tl, 'themes.', v))
                .join(', '),
            })
          : t('reasonNoThemes');
      case 'language':
        return r.values.length
          ? t('reasonLanguage', {
              values: r.values
                .map((v) => vocabulary(tl, 'langs.', v))
                .join(', '),
            })
          : t('reasonNoLanguage');
      case 'region':
        return r.values.length
          ? t('reasonRegion', {
              value: vocabulary(t, 'regions.', r.values[0]),
            })
          : t('reasonNoRegion');
      case 'timezone':
        return t('reasonTimezone', { hours: r.hours });
      case 'load':
        return t('reasonLoad', { active: r.active, capacity: r.capacity });
    }
  };
  return (
    <div>
      <p className="font-mono text-sm text-ink">{t('scoreLabel', { score })}</p>
      <ul className="mt-1 space-y-0.5 text-[13px] text-ink-soft">
        {list.map((r) => (
          <li key={r.kind} className="flex justify-between gap-3">
            <span className="wrap-anywhere">{line(r)}</span>
            <span className="shrink-0 font-mono text-muted">
              {t('reasonPoints', { points: r.points })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

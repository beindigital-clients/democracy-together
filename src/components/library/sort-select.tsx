'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { PUB_SORTS } from '@/lib/publications';
import { vocabulary } from '@/i18n/vocabulary';

// Library sorting — progressive enhancement: updates the URL's `sort`
// parameter while preserving active filters. The list stays server-rendered;
// this select only navigates.
export function SortSelect({ value }: { value: string }) {
  const t = useTranslations('library');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(next: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === 'recent') sp.delete('sort');
    else sp.set('sort', next);
    sp.delete('page'); // a sort change returns to page 1
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      {t('sortLabel')}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-line-field bg-surface px-2.5 py-1.5 text-sm text-ink"
      >
        {PUB_SORTS.map((s) => (
          <option key={s} value={s}>
            {vocabulary(t, 'sort.', s)}
          </option>
        ))}
      </select>
    </label>
  );
}

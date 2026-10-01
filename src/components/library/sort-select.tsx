'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { PUB_SORTS } from '@/lib/publications';
import { vocabulary } from '@/i18n/vocabulary';
import { SelectField } from '@/components/ui/choice-fields';

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
    <SelectField
      label={t('sortLabel')}
      orientation="horizontal"
      size="sm"
      value={value}
      onValueChange={onChange}
      options={PUB_SORTS.map((s) => ({
        value: s,
        label: vocabulary(t, 'sort.', s),
      }))}
    />
  );
}

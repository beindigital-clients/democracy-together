'use client';

import { useSearchParams } from 'next/navigation';
import { useRouter, usePathname } from '@/i18n/navigation';
import { SelectField } from '@/components/ui/choice-fields';

// Generic sort selector, driven by the URL (progressive enhancement): updates
// the `sort` parameter while preserving the other filters. The list stays
// server-rendered; this select only navigates.
export function UrlSortSelect({
  label,
  value,
  defaultValue,
  options,
}: {
  label: string;
  value: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(next: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === defaultValue) sp.delete('sort');
    else sp.set('sort', next);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <SelectField
      label={label}
      orientation="horizontal"
      size="sm"
      value={value}
      onValueChange={onChange}
      options={options}
    />
  );
}

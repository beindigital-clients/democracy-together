'use client';

import { useSearchParams } from 'next/navigation';
import { useRouter, usePathname } from '@/i18n/navigation';

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
    <label className="flex items-center gap-2 text-sm text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-line-field bg-surface px-2.5 py-1.5 text-sm text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

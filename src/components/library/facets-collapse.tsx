'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { hasActiveFilters, type LibraryFilters } from '@/lib/publications';

// Responsive wrapper for the facets (F-32). Below `lg`, the (long) filter
// panel pushed all content below the fold -> we collapse it
// behind a "Filtrer (N)" button. From `lg` up, it becomes the always-visible
// sticky sidebar again (the button disappears). The facets
// themselves stay server-rendered (GET links) and are passed as `children`.
export function FacetsCollapse({
  filters,
  children,
}: {
  filters: LibraryFilters;
  children: ReactNode;
}) {
  const t = useTranslations('library');
  const [open, setOpen] = useState(false);

  const activeCount =
    filters.themes.length +
    filters.types.length +
    filters.regions.length +
    filters.langs.length +
    filters.access.length;

  return (
    <aside aria-label={t('filter')} className="lg:sticky lg:top-24">
      <div className="mb-4 flex items-center justify-between gap-3">
        {/* < lg : bouton repliable */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="library-facets"
          className="flex items-center gap-2 font-display text-lg text-ink lg:hidden"
        >
          {t('filter')}
          {activeCount > 0 ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-medium text-accent-contrast">
              {activeCount}
            </span>
          ) : null}
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              d="m6 9 6 6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {/* lg : titre statique */}
        <h2 className="hidden font-display text-lg lg:block">{t('filter')}</h2>

        {hasActiveFilters(filters) ? (
          <Link
            href="/bibliotheque"
            className="text-[12.5px] text-accent-text hover:underline"
          >
            {t('reset')}
          </Link>
        ) : null}
      </div>

      <div
        id="library-facets"
        className={`${open ? 'block' : 'hidden'} lg:block`}
      >
        {children}
      </div>
    </aside>
  );
}

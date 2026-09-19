import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import {
  toggleHref,
  type LibraryFilters,
  type FacetKey,
} from '@/lib/publications';
import type { Facet } from '@convex/lib/publications';

type Facets = {
  themes: Facet[];
  types: Facet[];
  regions: Facet[];
  languages: Facet[];
  access: Facet[];
};

// Facettes de la bibliothèque (F-32) — multi-sélection rendue côté serveur :
// chaque option est un lien (GET) qui bascule sa valeur dans l'URL. Fonctionne
// sans JavaScript, reste partageable et indexable (cohérent avec l'annuaire).
export async function LibraryFacets({
  facets,
  filters,
}: {
  facets: Facets;
  filters: LibraryFilters;
}) {
  const t = await getTranslations('library');

  const groups: {
    key: FacetKey;
    legend: string;
    ns: string;
    items: Facet[];
  }[] = [
    {
      key: 'themes',
      legend: t('facetTheme'),
      ns: 'themes',
      items: facets.themes,
    },
    { key: 'types', legend: t('facetType'), ns: 'types', items: facets.types },
    {
      key: 'regions',
      legend: t('facetRegion'),
      ns: 'regions',
      items: facets.regions,
    },
    {
      key: 'langs',
      legend: t('facetLang'),
      ns: 'langs',
      items: facets.languages,
    },
    {
      key: 'access',
      legend: t('facetAccess'),
      ns: 'access',
      items: facets.access,
    },
  ];

  return (
    <>
      {groups.map((g) =>
        g.items.length === 0 ? null : (
          <fieldset key={g.key} className="border-t border-line py-4">
            <legend className="mb-3 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
              {g.legend}
            </legend>
            <div className="flex flex-col">
              {g.items.map((opt) => {
                const active = filters[g.key].includes(opt.value);
                return (
                  <Link
                    key={opt.value}
                    href={toggleHref(filters, g.key, opt.value)}
                    aria-current={active ? 'true' : undefined}
                    className="group flex items-center gap-2.5 py-1 text-sm text-ink-soft transition-colors hover:text-ink"
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border transition-colors ${
                        active
                          ? 'border-accent bg-accent text-accent-contrast'
                          : 'border-line-strong bg-surface group-hover:border-ink'
                      }`}
                    >
                      {active ? (
                        <svg
                          viewBox="0 0 12 12"
                          className="h-2.5 w-2.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            d="M2.5 6.2 5 8.5 9.5 3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span className={active ? 'text-ink' : undefined}>
                      {t(`${g.ns}.${opt.value}`)}
                    </span>
                    <span className="ml-auto font-mono text-[11px] text-muted">
                      {opt.count}
                    </span>
                  </Link>
                );
              })}
            </div>
          </fieldset>
        ),
      )}
    </>
  );
}

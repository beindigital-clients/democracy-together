import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  countryFlag,
  countryName,
  languageName,
  type DirectoryFacetParam,
  type DirectoryFilters as Filters,
  type Facet,
  type Facets,
} from '@/lib/orgs';
import { vocabulary } from '@/i18n/vocabulary';
import { DirectorySearch } from './directory-search';
import { FacetMenu, type FacetOption } from './facet-menu';

type FacetGroup = {
  param: DirectoryFacetParam;
  label: string;
  allLabel: string;
  options: FacetOption[];
};

// Directory filters (F-19): ONE bar — the full-text search, then the four
// requested facets (region, theme, country, language), each folded into a
// menu (`FacetMenu`). It replaces four rows of always-expanded chips that
// pushed the list below the fold.
//
// Each choice is still a URL (GET): shareable, and "Back" undoes it.
// WITHOUT JavaScript the menus cannot open: they are hidden
// (`noscript:hidden`) and a form of native selects, served in a
// `<noscript>`, takes over — same URL, same server.
export function DirectoryFilters({
  facets,
  filters,
  total,
}: {
  facets: Facets;
  filters: Filters;
  total: number;
}) {
  const t = useTranslations('directory');
  const locale = useLocale();
  const collator = new Intl.Collator(locale);

  // Options sorted by LABEL, no longer by frequency: in a menu, people look
  // for a name they know. The member count stays displayed next to it. A
  // valid URL value may match no member (`?region=europe-est`): it is added,
  // at zero, so the button shows the filter that empties the list instead of
  // hiding it.
  function optionsOf(
    list: Facet[],
    toOption: (facet: Facet) => FacetOption,
    selected: string | undefined,
  ): FacetOption[] {
    const options = list.map(toOption);
    if (selected && !options.some((o) => o.value === selected)) {
      options.push(toOption({ value: selected, count: 0 }));
    }
    return options.sort((a, b) => collator.compare(a.label, b.label));
  }

  const groups: FacetGroup[] = [
    {
      param: 'region',
      label: t('filterRegion'),
      allLabel: t('allRegions'),
      options: optionsOf(
        facets.regions,
        (f) => ({
          value: f.value,
          label: vocabulary(t, 'regions.', f.value),
          count: f.count,
        }),
        filters.region,
      ),
    },
    {
      param: 'theme',
      label: t('filterTheme'),
      allLabel: t('allThemes'),
      options: optionsOf(
        facets.themes,
        (f) => ({
          value: f.value,
          label: vocabulary(t, 'themes.', f.value),
          count: f.count,
        }),
        filters.theme,
      ),
    },
    {
      // Lowercase ISO codes in the URL, names rendered by
      // `Intl.DisplayNames` in the page's language.
      param: 'country',
      label: t('filterCountry'),
      allLabel: t('allCountries'),
      options: optionsOf(
        facets.countries,
        (f) => ({
          value: f.value.toLowerCase(),
          label: countryName(f.value, locale),
          count: f.count,
          flag: countryFlag(f.value),
        }),
        filters.country,
      ),
    },
    {
      param: 'language',
      label: t('filterLanguage'),
      allLabel: t('allLanguages'),
      options: optionsOf(
        facets.languages,
        (f) => ({
          value: f.value.toLowerCase(),
          // "anglais" mid-sentence, "Anglais" at the start of a menu item.
          label: capitalize(languageName(f.value, locale), locale),
          count: f.count,
        }),
        filters.language,
      ),
    },
  ];
  // Backend unreachable: no facets, hence no empty menu to open.
  const visible = groups.filter((g) => g.options.length > 0);

  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <DirectorySearch
          filters={filters}
          placeholder={t('searchPlaceholder')}
          cta={t('searchCta')}
        />
        {visible.length ? (
          <div
            role="group"
            aria-label={t('filtersLabel')}
            className="flex flex-wrap gap-2 noscript:hidden"
          >
            {visible.map((g) => (
              <FacetMenu
                key={g.param}
                param={g.param}
                label={g.label}
                allLabel={g.allLabel}
                total={total}
                options={g.options}
                filters={filters}
              />
            ))}
          </div>
        ) : null}
      </div>

      {visible.length ? (
        <noscript>
          <form className="mt-4 flex flex-wrap items-end gap-3">
            {filters.q ? (
              <input type="hidden" name="q" value={filters.q} />
            ) : null}
            {visible.map((g) => (
              <label key={g.param} className="flex flex-col gap-1.5">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                  {g.label}
                </span>
                <Select
                  name={g.param}
                  defaultValue={filters[g.param] ?? ''}
                  className="h-10"
                >
                  <option value="">{g.allLabel}</option>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {`${o.label} (${o.count})`}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
            <Button type="submit" variant="outline" className="h-10 py-0">
              {t('filtersApply')}
            </Button>
          </form>
        </noscript>
      ) : null}
    </div>
  );
}

function capitalize(label: string, locale: string): string {
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

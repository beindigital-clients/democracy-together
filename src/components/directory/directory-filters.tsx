import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  countryFlag,
  countryName,
  languageName,
  type DirectoryFilters as Filters,
  type Facets,
} from '@/lib/orgs';
import { vocabulary } from '@/i18n/vocabulary';

// Construit l'URL de l'annuaire avec un filtre modifié, en préservant les
// autres (undefined = on retire le filtre). next-intl ajoute le préfixe locale.
function buildHref(filters: Filters, patch: Partial<Filters>): string {
  const next = { ...filters, ...patch };
  const sp = new URLSearchParams();
  if (next.region) sp.set('region', next.region);
  if (next.theme) sp.set('theme', next.theme);
  if (next.country) sp.set('country', next.country);
  if (next.language) sp.set('language', next.language);
  if (next.q) sp.set('q', next.q);
  const qs = sp.toString();
  return qs ? `/le-reseau?${qs}` : '/le-reseau';
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-accent-edge bg-accent-tint text-accent-text'
          : 'border-line bg-surface-2 text-ink-soft hover:border-line-strong hover:text-ink'
      }`}
    >
      {children}
    </Link>
  );
}

// Filtres de l'annuaire (F-19) : recherche plein texte + les quatre facettes
// demandées — région, thématique, pays, langue (les deux dernières manquaient,
// mesuré le 27/09). Tout est rendu côté serveur ; chaque filtre est un lien
// (GET), donc fonctionne sans JavaScript et reste partageable / indexable.
// Pays et langues sont des codes ISO rendus par `Intl.DisplayNames` dans la
// langue de la page ; les chips portent le code en minuscules dans l'URL.
export function DirectoryFilters({
  facets,
  filters,
}: {
  facets: Facets;
  filters: Filters;
}) {
  const t = useTranslations('directory');
  const locale = useLocale();

  return (
    <div className="space-y-5">
      <form role="search" className="flex max-w-md gap-2">
        {filters.region ? (
          <input type="hidden" name="region" value={filters.region} />
        ) : null}
        {filters.theme ? (
          <input type="hidden" name="theme" value={filters.theme} />
        ) : null}
        {filters.country ? (
          <input type="hidden" name="country" value={filters.country} />
        ) : null}
        {filters.language ? (
          <input type="hidden" name="language" value={filters.language} />
        ) : null}
        <Input
          type="search"
          name="q"
          defaultValue={filters.q ?? ''}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
        />
        <Button type="submit" variant="outline" className="shrink-0">
          {t('searchCta')}
        </Button>
      </form>

      <fieldset>
        <legend className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          {t('filterRegion')}
        </legend>
        <div className="flex flex-wrap gap-2">
          <Chip
            href={buildHref(filters, { region: undefined })}
            active={!filters.region}
          >
            {t('all')}
          </Chip>
          {facets.regions.map((r) => (
            <Chip
              key={r.value}
              href={buildHref(filters, { region: r.value })}
              active={filters.region === r.value}
            >
              {vocabulary(t, 'regions.', r.value)}
              <span className="text-muted">{r.count}</span>
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          {t('filterTheme')}
        </legend>
        <div className="flex flex-wrap gap-2">
          <Chip
            href={buildHref(filters, { theme: undefined })}
            active={!filters.theme}
          >
            {t('all')}
          </Chip>
          {facets.themes.map((th) => (
            <Chip
              key={th.value}
              href={buildHref(filters, { theme: th.value })}
              active={filters.theme === th.value}
            >
              {vocabulary(t, 'themes.', th.value)}
              <span className="text-muted">{th.count}</span>
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          {t('filterCountry')}
        </legend>
        <div className="flex flex-wrap gap-2">
          <Chip
            href={buildHref(filters, { country: undefined })}
            active={!filters.country}
          >
            {t('all')}
          </Chip>
          {facets.countries.map((c) => {
            const code = c.value.toLowerCase();
            return (
              <Chip
                key={c.value}
                href={buildHref(filters, { country: code })}
                active={filters.country?.toLowerCase() === code}
              >
                <span aria-hidden="true">{countryFlag(c.value)}</span>
                {countryName(c.value, locale)}
                <span className="text-muted">{c.count}</span>
              </Chip>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          {t('filterLanguage')}
        </legend>
        <div className="flex flex-wrap gap-2">
          <Chip
            href={buildHref(filters, { language: undefined })}
            active={!filters.language}
          >
            {t('all')}
          </Chip>
          {facets.languages.map((l) => {
            const code = l.value.toLowerCase();
            return (
              <Chip
                key={l.value}
                href={buildHref(filters, { language: code })}
                active={filters.language?.toLowerCase() === code}
              >
                {languageName(l.value, locale)}
                <span className="text-muted">{l.count}</span>
              </Chip>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

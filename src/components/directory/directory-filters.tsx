import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { DirectoryFilters as Filters, Facets } from '@/lib/orgs';

// Construit l'URL de l'annuaire avec un filtre modifié, en préservant les
// autres (undefined = on retire le filtre). next-intl ajoute le préfixe locale.
function buildHref(filters: Filters, patch: Partial<Filters>): string {
  const next = { ...filters, ...patch };
  const sp = new URLSearchParams();
  if (next.region) sp.set('region', next.region);
  if (next.theme) sp.set('theme', next.theme);
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

// Filtres de l'annuaire (F-19) : recherche plein texte + facettes région /
// thématique. Tout est rendu côté serveur ; chaque filtre est un lien (GET),
// donc fonctionne sans JavaScript et reste partageable / indexable.
export function DirectoryFilters({
  facets,
  filters,
}: {
  facets: Facets;
  filters: Filters;
}) {
  const t = useTranslations('directory');

  return (
    <div className="space-y-5">
      <form role="search" className="flex max-w-md gap-2">
        {filters.region ? (
          <input type="hidden" name="region" value={filters.region} />
        ) : null}
        {filters.theme ? (
          <input type="hidden" name="theme" value={filters.theme} />
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
              {t(`regions.${r.value}`)}
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
              {t(`themes.${th.value}`)}
              <span className="text-muted">{th.count}</span>
            </Chip>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

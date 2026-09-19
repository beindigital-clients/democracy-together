import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { countryName, countryFlag, languageName } from '@/lib/orgs';
import type { PublicOrganization } from '@convex/lib/directory';

// Carte d'un think tank dans l'annuaire (F-19). Toute la carte est cliquable
// vers la fiche membre (F-21). Composant serveur (rendu SSR, zéro JS).
export function OrgCard({
  org,
  locale,
}: {
  org: PublicOrganization;
  locale: string;
}) {
  const t = useTranslations('directory');
  return (
    <Link
      href={`/le-reseau/${org.slug}`}
      className="group flex h-full flex-col rounded-md border border-line bg-surface p-5 shadow-card transition-colors hover:border-line-strong"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
        <span aria-hidden="true">{countryFlag(org.country)}</span>
        <span>{countryName(org.country, locale)}</span>
        <span className="text-line-strong">·</span>
        <span>{t(`regions.${org.region}`)}</span>
      </div>

      <h2 className="mt-3 font-display text-xl leading-snug text-ink transition-colors group-hover:text-accent-text">
        {org.name}
      </h2>

      {org.description ? (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-soft">
          {org.description}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {org.themes.slice(0, 3).map((theme) => (
          <Badge key={theme} variant="accent">
            {t(`themes.${theme}`)}
          </Badge>
        ))}
      </div>

      <div className="mt-auto pt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
        {org.languages.map((l) => languageName(l, locale)).join(' · ')}
      </div>
    </Link>
  );
}

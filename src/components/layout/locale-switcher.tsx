'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';
import { withSearchParams } from '@/i18n/href';
import { routing } from '@/i18n/routing';

// Bascule de langue segmentée, façon maquette (`.lang`) : toutes les langues de
// `routing.locales` côte à côte, l'active surlignée en accent, **un seul clic**
// pour basculer. Piloté par la config (pas de FR|EN figé), mais affiché en
// ligne — pas d'accordéon. `router.replace(href, { locale })` change le
// préfixe d'URL ET pose le cookie NEXT_LOCALE.
//
// La query string est conservée (issue #35) : `usePathname` de next-intl rend
// le chemin dépouillé de la locale ET de la query, il faut donc lui rejoindre
// `useSearchParams`. Sans cela, changer de langue sur une page filtrée —
// bibliothèque, annuaire, événements, recherche, thématiques — perdait tous
// les filtres. C'est le motif déjà suivi par les sélecteurs de tri
// (`SortSelect`, `UrlSortSelect`).
export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations('nav');

  return (
    <div
      role="group"
      aria-label={t('language')}
      className="inline-flex overflow-hidden rounded-sm border border-line-strong"
    >
      {routing.locales.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={active}
            onClick={() => {
              if (!active) {
                router.replace(
                  withSearchParams(pathname, searchParams.toString()),
                  { locale: l },
                );
              }
            }}
            className={`px-2.5 py-1.5 font-mono text-[11.5px] font-semibold uppercase leading-none transition-colors ${
              active
                ? 'bg-accent text-accent-contrast'
                : 'bg-surface text-muted hover:text-ink'
            }`}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

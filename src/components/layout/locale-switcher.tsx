'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

// Bascule de langue segmentée, façon maquette (`.lang`) : toutes les langues de
// `routing.locales` côte à côte, l'active surlignée en accent, **un seul clic**
// pour basculer. Piloté par la config (pas de FR|EN figé), mais affiché en
// ligne — pas d'accordéon. `router.replace(pathname, { locale })` change le
// préfixe d'URL ET pose le cookie NEXT_LOCALE.
export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
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
              if (!active) router.replace(pathname, { locale: l });
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

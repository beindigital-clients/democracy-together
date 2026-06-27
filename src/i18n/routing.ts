import { defineRouting } from 'next-intl/routing';

// Langue dans l'URL (/fr, /en) — choix SEO : chaque langue = une URL distincte,
// indexable, cacheable CDN, avec hreflang. La préférence est mémorisée par
// next-intl dans un cookie (NEXT_LOCALE), lisible côté serveur dès le 1er rendu.
// Architecture extensible (pt, ar + RTL) sans refonte.
export const routing = defineRouting({
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];

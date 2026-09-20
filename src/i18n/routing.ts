import { defineRouting } from 'next-intl/routing';

// Langue dans l'URL (/fr, /en) — choix SEO : chaque langue = une URL distincte,
// indexable, cacheable CDN, avec hreflang. La préférence est mémorisée par
// next-intl dans un cookie (NEXT_LOCALE), lisible côté serveur dès le 1er rendu.
// Ajouter une langue qui s'écrit de gauche à droite (pt) tient dans cette
// configuration : une locale de plus, plus la traduction du catalogue de
// messages. Une langue RTL (ar) n'y tient pas — la feuille de style est écrite
// en propriétés physiques (ml-, pr-, left-, text-left…) et les polices ne
// chargent que le sous-ensemble latin. Le travail réel est listé dans
// l'issue #23 ; tant qu'il n'est pas fait, l'arabe n'est pas « sans refonte ».
export const routing = defineRouting({
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];

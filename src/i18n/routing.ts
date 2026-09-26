import { defineRouting } from 'next-intl/routing';

// Langue dans l'URL (/fr, /en, /es, /pt, /ar) — choix SEO : chaque langue = une
// URL distincte, indexable, cacheable CDN, avec hreflang. La préférence est
// mémorisée par next-intl dans un cookie (NEXT_LOCALE), lisible côté serveur
// dès le 1er rendu.
//
// L'ARABE EST SERVI, et il ne l'a pas toujours été. Ce commentaire affirmait
// l'architecture « extensible (pt, ar + RTL) sans refonte », ce que l'audit a
// démenti (issue #23) : la feuille de style était écrite en propriétés
// PHYSIQUES (`text-left`, `border-l`…) et les polices ne chargeaient que le
// sous-ensemble latin. Les deux défauts sont corrigés — les 43 utilitaires
// physiques sont passés en logiques (`text-start`, `border-s`…), et
// `src/lib/fonts.ts` charge le sous-ensemble arabe. Ce qui reste vrai :
// AJOUTER UNE LANGUE DE PLUS qui s'écrit de gauche à droite ne demande qu'une
// entrée ici, un catalogue de messages et ses blocs de contenu éditorial.
//
// L'ORDRE EST CELUI DU SÉLECTEUR de langue, qui itère cette liste. Il n'est
// pas alphabétique : la langue par défaut vient en tête, puis l'anglais comme
// langue de travail du réseau, puis les langues ajoutées pour l'Afrique du
// Nord et les Amériques.
export const routing = defineRouting({
  locales: ['fr', 'en', 'es', 'pt', 'ar'],
  defaultLocale: 'fr',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];

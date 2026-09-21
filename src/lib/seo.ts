import { routing } from '@/i18n/routing';

// Métadonnées de partage et données structurées (audit F-03).
//
// Mesuré avant correctif : sur les 48 pages publiques (24 routes × 2 langues),
// ZÉRO balise Open Graph, zéro Twitter Card, zéro JSON-LD. Un lien partagé sur
// une messagerie ou un réseau social apparaissait nu — pas de titre, pas de
// description, pas d'image. Pour un réseau dont l'objet est la diffusion
// d'analyses, et dont le canal de partage principal sur la zone visée est la
// messagerie, c'est une perte à chaque partage.

// NOM PROPRE : il ne se traduit pas (même règle que le `title` du layout).
export const SITE_NAME = 'Democracy Together';

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

// Open Graph attend une étiquette de langue territorialisée (`fr_FR`), pas un
// code ISO court (`fr`). Une valeur absente vaut mieux qu'une valeur inventée :
// on ne devine pas le territoire d'une locale qu'on ne connaît pas.
const OG_LOCALES: Record<string, string> = {
  fr: 'fr_FR',
  en: 'en_US',
};

export function openGraphLocale(locale: string): string | undefined {
  return OG_LOCALES[locale];
}

/**
 * Les autres langues du site, au format attendu par `openGraph.alternateLocale`.
 * Sert à déclarer que la même page existe ailleurs, sans la répéter.
 */
export function alternateOpenGraphLocales(locale: string): string[] {
  return routing.locales
    .filter((l) => l !== locale)
    .map(openGraphLocale)
    .filter((l): l is string => Boolean(l));
}

/**
 * Fiche `Organization` (schema.org), posée une fois pour tout le site.
 *
 * Volontairement minimale : on ne déclare que ce dont le dépôt dispose
 * réellement. Une adresse postale ou un profil social inventés seraient une
 * donnée fausse servie aux moteurs, ce qui est pire que leur absence.
 */
export function organizationJsonLd(description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    description,
    logo: `${SITE_URL}/brand/democracy-together-logo.png`,
  };
}

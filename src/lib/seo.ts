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
 * Bloc `alternates` d'une page indexable : adresse canonique + hreflang.
 *
 * La forme reprend EXACTEMENT celle que `src/app/sitemap.ts` déclare pour la
 * même page (fr, en, x-default) — son en-tête dit que les alternates du
 * sitemap sont « cohérents avec les canonicals posés par les
 * generateMetadata ». Deux écritures séparées de la même règle finissent par
 * diverger ; celle-ci est la seule.
 *
 * À NE PAS employer sur une page en `noindex` : un moteur y ignore le
 * hreflang, et le dépôt a tranché (issue #35) que l'ajouter ne serait que du
 * bruit. `/recherche` et les billets de Tribune en sont les cas testés.
 */
export function alternatesFor(locale: string, path: string) {
  const suffix = path ? `/${path}` : '';
  const languages: Record<string, string> = {
    'x-default': `${SITE_URL}/fr${suffix}`,
  };
  for (const l of routing.locales) languages[l] = `${SITE_URL}/${l}${suffix}`;
  return {
    canonical: `${SITE_URL}/${locale}${suffix}`,
    languages,
  };
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

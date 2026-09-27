import { routing } from '@/i18n/routing';

// 404 SERVIE DANS LA LANGUE DU VISITEUR, par réécriture au middleware (R-04,
// arbitrage client du 23/09, point 4).
//
// Le constat : une adresse sans route sous un préfixe de langue (`/ar/xyz`,
// `/fr/nimporte-quoi`) recevait la 404 RACINE — bilingue fr/en, `lang="fr"`,
// sans en-tête ni pied de page. Un `notFound()` levé depuis une route qui
// matche rend un corps vide sans JavaScript sur Next 16.3.5 (mesuré, cf.
// src/app/not-found.tsx) : une route attrape-tout n'est donc pas une solution.
// Ce qui l'est : le middleware reconnaît un PREMIER SEGMENT inconnu et
// RÉÉCRIT la requête vers une vraie page (`/<locale>/introuvable`), rendue
// dans le layout de langue — en-tête, pied de page, `lang`/`dir` corrects,
// lisible sans JavaScript — avec le statut 404.
//
// La liste des premiers segments connus est celle des dossiers de
// `src/app/[locale]/`. Le middleware tourne sur le runtime edge, sans système
// de fichiers : la liste est ÉCRITE ici, et `tests/unit/seo-not-found-
// routes.test.ts` la compare aux dossiers réels — un dossier ajouté sans son
// entrée fait échouer le test, au lieu de répondre 404 en production.
export const KNOWN_LOCALE_SEGMENTS = [
  'a-propos',
  'accessibilite',
  'actualites',
  'adhesion',
  'admin',
  'analyses',
  'appels-a-projets',
  'barometre',
  'bibliotheque',
  'boite-a-outils',
  'confidentialite',
  'connexion',
  'connexion-otp',
  'contact',
  'don',
  'espace-membre',
  'espaces',
  'evenements',
  'experts',
  'inscription',
  'jeunes',
  'le-reseau',
  'mentions-legales',
  'mot-de-passe-oublie',
  'newsletter',
  'notifications',
  'parcours',
  'partenaires',
  'presse',
  'rapports',
  'recherche',
  'replays',
  'thematiques',
  'tribune',
] as const;

// Segment de la page « introuvable ». VOLONTAIREMENT absent de la liste
// ci-dessus : une visite directe de `/fr/introuvable` est elle aussi réécrite
// vers elle-même avec le statut 404, au lieu d'un 200 qu'un moteur
// indexerait comme une page vide.
export const NOT_FOUND_SEGMENT = 'introuvable';

const LOCALES: readonly string[] = routing.locales;
const KNOWN: ReadonlySet<string> = new Set(KNOWN_LOCALE_SEGMENTS);

// Un segment « vide » que Next normalise en segment sans contenu : l'octet nul
// encodé (`/fr/le-reseau/%00` répondait 200 avec la page de liste, mesuré le
// 27/09, vitrine O4) ou une barre oblique doublée. Aucune page du site n'a
// de slug vide : c'est un 404, pas une liste.
function hasEmptySegment(segments: string[]): boolean {
  return segments.some((s) => {
    try {
      const decoded = decodeURIComponent(s);
      return decoded.trim() === '' || decoded.includes('\0');
    } catch {
      // Encodage invalide (`%E0%A4%A`) : pas une adresse du site.
      return true;
    }
  });
}

/**
 * Chemin de réécriture 404 pour une requête, ou `null` si la requête doit
 * suivre son cours normal.
 *
 * Ne se prononce QUE sur les chemins déjà préfixés d'une langue servie : un
 * chemin sans préfixe (`/xx`, `/de`) est d'abord redirigé par next-intl vers
 * `/<langue détectée>/xx`, et c'est cette seconde requête qui reçoit la 404 —
 * dans la langue du visiteur, ce qui est le but.
 */
export function notFoundRewriteFor(pathname: string): string | null {
  const segments = pathname.split('/').filter((s) => s !== '');
  const [locale, first] = segments;
  if (!locale || !LOCALES.includes(locale)) return null;
  const target = `/${locale}/${NOT_FOUND_SEGMENT}`;
  if (first === undefined) return null; // `/fr` : l'accueil
  if (!KNOWN.has(first)) return target;
  // Un segment vide n'importe où sous une route connue (`/fr/le-reseau/%00`).
  // `split('/')` a déjà retiré les segments vides des `//` : on relit le
  // chemin brut pour les compter.
  if (pathname.includes('//') || hasEmptySegment(segments.slice(1))) {
    return target;
  }
  return null;
}

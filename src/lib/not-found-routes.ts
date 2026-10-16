import { routing } from '@/i18n/routing';

// 404 SERVED IN THE VISITOR'S LANGUAGE, via a middleware rewrite (R-04,
// client decision of 23/09, point 4).
//
// The finding: an address with no route under a language prefix (`/ar/xyz`,
// `/fr/nimporte-quoi`) received the ROOT 404 — bilingual fr/en, `lang="fr"`,
// with no header or footer. A `notFound()` thrown from a route that
// matches renders an empty body without JavaScript on Next 16.3.5 (measured, see
// src/app/not-found.tsx): a catch-all route is therefore not a solution.
// What is: the middleware recognizes an unknown FIRST SEGMENT and
// REWRITES the request to a real page (`/<locale>/introuvable`), rendered
// in the language layout — header, footer, correct `lang`/`dir`,
// readable without JavaScript — with a 404 status.
//
// The list of known first segments is that of the folders in
// `src/app/[locale]/`. The middleware runs on the edge runtime, with no file
// system: the list is WRITTEN here, and `tests/unit/seo-not-found-
// routes.test.ts` compares it with the actual folders — a folder added without its
// entry makes the test fail, instead of responding 404 in production.
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
  'kohop',
  'le-reseau',
  'membres',
  'mentions-legales',
  'mot-de-passe-oublie',
  'newsletter',
  'notifications',
  'paiement',
  'parcours',
  'partenaires',
  'presse',
  'rapports',
  'recherche',
  'replays',
  'thematiques',
  'tribune',
] as const;

// Segment of the "introuvable" page. DELIBERATELY absent from the list
// above: a direct visit to `/fr/introuvable` is also rewritten
// to itself with a 404 status, instead of a 200 that a search engine
// would index as an empty page.
export const NOT_FOUND_SEGMENT = 'introuvable';

const LOCALES: readonly string[] = routing.locales;
const KNOWN: ReadonlySet<string> = new Set(KNOWN_LOCALE_SEGMENTS);

// An "empty" segment that Next normalizes into a segment without content: the encoded
// null byte (`/fr/le-reseau/%00` responded 200 with the list page, measured on
// 27/09, showcase O4) or a doubled slash. No page on the site has
// an empty slug: it's a 404, not a list.
function hasEmptySegment(segments: string[]): boolean {
  return segments.some((s) => {
    try {
      const decoded = decodeURIComponent(s);
      return decoded.trim() === '' || decoded.includes('\0');
    } catch {
      // Invalid encoding (`%E0%A4%A`): not an address on the site.
      return true;
    }
  });
}

/**
 * 404 rewrite path for a request, or `null` if the request should
 * proceed normally.
 *
 * Only rules on paths already prefixed with a served language: a
 * path without a prefix (`/xx`, `/de`) is first redirected by next-intl to
 * `/<detected language>/xx`, and it is that second request that receives the 404 —
 * in the visitor's language, which is the goal.
 */
export function notFoundRewriteFor(pathname: string): string | null {
  const segments = pathname.split('/').filter((s) => s !== '');
  const [locale, first] = segments;
  if (!locale || !LOCALES.includes(locale)) return null;
  const target = `/${locale}/${NOT_FOUND_SEGMENT}`;
  if (first === undefined) return null; // `/fr` : l'accueil
  if (!KNOWN.has(first)) return target;
  // An empty segment anywhere under a known route (`/fr/le-reseau/%00`).
  // `split('/')` has already removed the empty segments from `//`: we re-read the
  // raw path to count them.
  if (pathname.includes('//') || hasEmptySegment(segments.slice(1))) {
    return target;
  }
  return null;
}

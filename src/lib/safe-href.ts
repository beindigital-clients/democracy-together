// Filtre de SCHÉMA sur les URL que ce dépôt n'écrit pas (pentest M-9).
//
// Deux sources alimentent des `href` venus d'ailleurs : les liens du texte
// riche Sanity (annotation `link`, saisie dans le CMS) et l'adresse de site
// d'une fiche d'annuaire, renseignée à l'adhésion puis publiée. Le pentest
// décrivait le cas `javascript:` ; le rejeu montre que c'est le MOINS grave
// des trois, et que le garde-fou sur lequel on aurait pu se reposer ne couvre
// que celui-là :
//
//   javascript:alert(1)       React 19 le neutralise LUI-MÊME — il réécrit
//                             l'attribut en `javascript:throw new Error(…)` et
//                             journalise un avertissement. Vérifié, toutes
//                             casses et avec espace de tête.
//   data:text/html;base64,…   passe TEL QUEL. Une page HTML complète, d'origine
//                             opaque, ouverte depuis un clic sur le site.
//   vbscript:msgbox(1)        passe tel quel.
//
// D'où une liste blanche plutôt qu'une liste noire : ce qui n'est pas
// explicitement autorisé est refusé, y compris le schéma qu'on inventera après
// cette relecture.
export const SCHEMAS_AUTORISES = ['http:', 'https:', 'mailto:'] as const;

// Base fictive servant à RÉSOUDRE les URL relatives. `/fr/actualites`,
// `#section` ou `?page=2` sont des liens légitimes dans un texte riche : sans
// base, `new URL` les rejetterait tous.
const BASE_RELATIVE = 'https://relative.invalid';

/**
 * L'URL si son schéma est autorisé, `undefined` sinon — au lieu d'un `href`
 * vide, qui ferait un lien mort au lieu d'un texte simple.
 *
 * POURQUOI `new URL` PLUTÔT QU'UN `startsWith`. L'analyseur d'URL du standard
 * WHATWG — celui de `new URL`, et celui que le navigateur applique à
 * l'attribut `href` — retire les tabulations et les retours à la ligne, ignore
 * les caractères de contrôle de tête, et met le schéma en minuscules. Un test
 * de préfixe écrit à la main laisserait passer `JaVaScRiPt:`, `java\tscript:`
 * et ` javascript:` ; ici les trois arrivent normalisés au moment de la
 * comparaison. La chaîne RENDUE est celle qui a été analysée, donc le
 * navigateur lira exactement ce que cette fonction a validé.
 */
export function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const href = value.trim();
  if (!href) return undefined;

  let url: URL;
  try {
    url = new URL(href, BASE_RELATIVE);
  } catch {
    return undefined;
  }

  return (SCHEMAS_AUTORISES as readonly string[]).includes(url.protocol)
    ? href
    : undefined;
}

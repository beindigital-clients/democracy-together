import type { Locale } from './routing';
import { direction } from './direction';
import { resolveLocale } from './locale';

// LANGUE D'UN CONTENU DANS UNE PAGE D'UNE AUTRE LANGUE (RGAA 8.7 / 8.8).
//
// Le site est servi en cinq langues, mais ses CONTENUS ne sont écrits que dans
// une : une publication, un billet de Tribune, la description d'un membre.
// Mesuré à l'audit RGAA du 27/09, sur `/ar/le-reseau`, `/ar/bibliotheque`,
// `/ar/tribune` et `/ar/recherche` : les titres et descriptions français
// étaient lus par la voix ARABE du lecteur d'écran (aucun `lang` sur le bloc),
// et composés de droite à gauche (aucun `dir`). Les fiches détaillées posaient
// déjà les deux (issue #35) ; les LISTES qui y mènent, non.
//
// Module neutre (ni serveur ni client) : la palette de recherche, composant
// client, en a besoin autant que les pages serveur.

/**
 * Attributs `lang` et `dir` d'un bloc de texte.
 *
 * Un titre arabe dans une page française doit se composer de DROITE À GAUCHE,
 * et être annoncé comme arabe à la synthèse vocale : sans `dir`, la ponctuation
 * et les chiffres se placent du mauvais côté ; sans `lang`, un lecteur d'écran
 * lit l'arabe avec la voix française.
 *
 * Les deux attributs sont OMIS quand le bloc est dans la langue de la page :
 * un `lang="fr" dir="ltr"` redondant sur chaque paragraphe alourdit le HTML
 * sans rien apporter.
 */
export function textAttrs(
  contentLocale: Locale,
  pageLocale: Locale,
): { lang?: string; dir?: 'ltr' | 'rtl' } {
  if (contentLocale === pageLocale) return {};
  return { lang: contentLocale, dir: direction(contentLocale) };
}

/**
 * Même chose à partir de valeurs brutes (segment d'URL, champ optionnel).
 *
 * Une langue de contenu ABSENTE vaut la langue par défaut (le français) : c'est
 * le repli déjà retenu pour les billets antérieurs au champ `lang` (issue #35)
 * et pour les publications (`languages[0]`), et c'est la langue de rédaction du
 * back-office.
 */
export function contentLangAttrs(
  contentLocale: string | null | undefined,
  pageLocale: string,
): { lang?: string; dir?: 'ltr' | 'rtl' } {
  return textAttrs(resolveLocale(contentLocale), resolveLocale(pageLocale));
}

/**
 * Langue de rédaction des descriptions de l'annuaire.
 *
 * Elles sont saisies par la modération, dans le back-office, au moment de
 * valider une adhésion (`organizations.reviewApplication`) — et le jeu de
 * démonstration est rédigé en français. Aucun champ ne porte leur langue :
 * c'est donc le français, déclaré ICI une fois. Le jour où la fiche gagnera un
 * champ de langue, c'est cette constante qui cédera la place.
 */
export const ORG_DESCRIPTION_LOCALE: Locale = 'fr';

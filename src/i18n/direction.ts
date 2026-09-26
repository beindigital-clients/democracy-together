import { routing, type Locale } from './routing';

// SENS D'ÉCRITURE — déclaration unique.
//
// Même motif que `resolveLocale` (issue #41) : une information dérivée de la
// locale qui, laissée à chaque appelant, se réécrit en vingt endroits et
// diverge. Le sens d'écriture est demandé par le `<html dir>`, par le
// sélecteur de langue, par la vue document imprimable, par les composants qui
// retournent une icône directionnelle et par les tests. Il est écrit ICI.
//
// POURQUOI UNE TABLE EXPLICITE et pas une liste `RTL = ['ar']` interrogée par
// `includes`. Le type `Record<Locale, Direction>` rend la table EXHAUSTIVE par
// construction : ajouter une locale à `routing.locales` sans dire dans quel
// sens elle s'écrit ne compile pas. Une liste, elle, aurait accepté en silence
// une locale hébraïque ou persane en la traitant comme latine — et le défaut
// ne serait apparu qu'à l'écran, sur une page entière mise à l'envers.
//
// Le même choix que `ATTENDANCE_MODE` dans `src/lib/seo.ts`, pour la même
// raison.

export type Direction = 'ltr' | 'rtl';

const DIRECTIONS: Record<Locale, Direction> = {
  fr: 'ltr',
  en: 'ltr',
  es: 'ltr',
  pt: 'ltr',
  ar: 'rtl',
};

/** Sens d'écriture d'une locale du site. */
export function direction(locale: Locale): Direction {
  return DIRECTIONS[locale];
}

/** La locale s'écrit-elle de droite à gauche ? */
export function isRtl(locale: Locale): boolean {
  return DIRECTIONS[locale] === 'rtl';
}

/**
 * Sens d'écriture d'une chaîne de langue quelconque.
 *
 * Variante tolérante de `direction()`, pour les valeurs qui n'ont pas encore
 * traversé `resolveLocale` — un segment d'URL, la langue d'un billet lue en
 * base, la langue source d'une traduction. Une valeur inconnue est traitée
 * comme latine : c'est le sens de la langue par défaut du site, et retourner
 * `rtl` sur une valeur qu'on ne comprend pas retournerait la page entière.
 */
export function directionOf(value: string | null | undefined): Direction {
  return value && value in DIRECTIONS
    ? DIRECTIONS[value as Locale]
    : DIRECTIONS[routing.defaultLocale];
}

/**
 * Nom de la langue DANS CETTE LANGUE (endonyme), pour le sélecteur.
 *
 * « Español », pas « Espagnol » : quelqu'un qui cherche sa langue dans une
 * interface qu'il ne lit pas cherche le mot qu'il connaît. C'est la règle
 * suivie par tous les sélecteurs de langue sérieux, et la raison pour laquelle
 * ces libellés NE SONT PAS dans les catalogues de messages — ils ne se
 * traduisent pas, ils sont les mêmes dans les cinq langues.
 *
 * `Intl.DisplayNames` saurait les produire, mais il dépend des données ICU
 * embarquées par le moteur : Node en mode `small-icu` renvoie le code brut.
 * Cinq constantes valent mieux qu'une dépendance à la compilation du runtime.
 */
export const LOCALE_ENDONYMS: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  pt: 'Português',
  ar: 'العربية',
};

/**
 * Étiquette courte du sélecteur, en capitales (« FR », « AR »).
 *
 * L'arabe n'a PAS de capitales et son code ISO en porterait donc une forme
 * latine au milieu d'une interface arabe. On sert son endonyme à la place.
 */
export function localeBadge(locale: Locale): string {
  return isRtl(locale) ? LOCALE_ENDONYMS[locale] : locale.toUpperCase();
}

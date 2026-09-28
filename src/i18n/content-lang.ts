import type { Locale } from './routing';
import { direction } from './direction';
import { resolveLocale } from './locale';

// LANGUAGE OF CONTENT INSIDE A PAGE IN ANOTHER LANGUAGE (RGAA 8.7 / 8.8).
//
// The site is served in five languages, but its CONTENT is written in only
// one: a publication, a Tribune post, a member's description.
// Measured in the 27/09 RGAA audit, on `/ar/le-reseau`, `/ar/bibliotheque`,
// `/ar/tribune` and `/ar/recherche`: French titles and descriptions
// were read by the screen reader's ARABIC voice (no `lang` on the block),
// and laid out right to left (no `dir`). The detail pages already set
// both (issue #35); the LISTS leading to them did not.
//
// Neutral module (neither server nor client): the search palette, a client
// component, needs it as much as the server pages.

/**
 * `lang` and `dir` attributes for a text block.
 *
 * An Arabic title in a French page must be laid out RIGHT TO LEFT,
 * and announced as Arabic to speech synthesis: without `dir`, punctuation
 * and digits land on the wrong side; without `lang`, a screen reader
 * reads the Arabic with the French voice.
 *
 * Both attributes are OMITTED when the block is in the page's language:
 * a redundant `lang="fr" dir="ltr"` on every paragraph bloats the HTML
 * for no benefit.
 */
export function textAttrs(
  contentLocale: Locale,
  pageLocale: Locale,
): { lang?: string; dir?: 'ltr' | 'rtl' } {
  if (contentLocale === pageLocale) return {};
  return { lang: contentLocale, dir: direction(contentLocale) };
}

/**
 * Same thing from raw values (URL segment, optional field).
 *
 * A MISSING content language means the default language (French): that is
 * the fallback already chosen for posts predating the `lang` field (issue #35)
 * and for publications (`languages[0]`), and it is the back-office's writing
 * language.
 */
export function contentLangAttrs(
  contentLocale: string | null | undefined,
  pageLocale: string,
): { lang?: string; dir?: 'ltr' | 'rtl' } {
  return textAttrs(resolveLocale(contentLocale), resolveLocale(pageLocale));
}

/**
 * Writing language of the directory descriptions.
 *
 * They are entered by moderation, in the back-office, when
 * approving a membership (`organizations.reviewApplication`) — and the demo
 * dataset is written in French. No field carries their language:
 * so it is French, declared HERE once. The day the record gains a
 * language field, this constant is what will give way.
 */
export const ORG_DESCRIPTION_LOCALE: Locale = 'fr';

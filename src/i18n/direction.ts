import { routing, type Locale } from './routing';

// WRITING DIRECTION — single declaration.
//
// Same pattern as `resolveLocale` (issue #41): a piece of information derived from the
// locale which, left to each caller, gets rewritten in twenty places and
// diverges. The writing direction is requested by `<html dir>`, by the
// language picker, by the printable document view, by components that
// flip a directional icon, and by the tests. It is written HERE.
//
// WHY AN EXPLICIT TABLE and not an `RTL = ['ar']` list queried with
// `includes`. The `Record<Locale, Direction>` type makes the table EXHAUSTIVE by
// construction: adding a locale to `routing.locales` without saying which
// direction it is written in doesn't compile. A list would silently have accepted
// a Hebrew or Persian locale by treating it as Latin — and the defect
// would only have appeared on screen, on an entire page laid out backwards.
//
// The same choice as `ATTENDANCE_MODE` in `src/lib/seo.ts`, for the same
// reason.

export type Direction = 'ltr' | 'rtl';

const DIRECTIONS: Record<Locale, Direction> = {
  fr: 'ltr',
  en: 'ltr',
  es: 'ltr',
  pt: 'ltr',
  ar: 'rtl',
};

/** Writing direction of a site locale. */
export function direction(locale: Locale): Direction {
  return DIRECTIONS[locale];
}

/** Is the locale written right to left? */
export function isRtl(locale: Locale): boolean {
  return DIRECTIONS[locale] === 'rtl';
}

/**
 * Writing direction of any language string.
 *
 * Lenient variant of `direction()`, for values that have not yet
 * gone through `resolveLocale` — a URL segment, a post's language read from
 * the database, a translation's source language. An unknown value is treated
 * as Latin: that is the direction of the site's default language, and returning
 * `rtl` for a value we don't understand would flip the entire page.
 */
export function directionOf(value: string | null | undefined): Direction {
  return value && value in DIRECTIONS
    ? DIRECTIONS[value as Locale]
    : DIRECTIONS[routing.defaultLocale];
}

/**
 * Name of the language IN THAT LANGUAGE (endonym), for the picker.
 *
 * "Español", not "Espagnol": someone looking for their language in an
 * interface they cannot read looks for the word they know. It is the rule
 * followed by every serious language picker, and the reason why
 * these labels are NOT in the message catalogues — they are not
 * translated, they are the same in all five languages.
 *
 * `Intl.DisplayNames` could produce them, but it depends on the ICU data
 * bundled with the engine: Node in `small-icu` mode returns the raw code.
 * Five constants are better than a dependency on how the runtime was compiled.
 */
export const LOCALE_ENDONYMS: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  pt: 'Português',
  ar: 'العربية',
};

/**
 * Short label for the picker, in capitals ("FR", "AR").
 *
 * Arabic has NO capitals, so its ISO code would put a Latin form
 * in the middle of an Arabic interface. We serve its endonym instead.
 */
export function localeBadge(locale: Locale): string {
  return isRtl(locale) ? LOCALE_ENDONYMS[locale] : locale.toUpperCase();
}

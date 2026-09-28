import { hasLocale } from 'next-intl';
import { routing, type Locale } from './routing';

// Normalizes a language string to a site locale.
//
// This function was rewritten identically in 20 files (issue #41):
// each `[locale]` URL segment arrives as a `string` and must be narrowed to the
// closed vocabulary of `routing.locales` before being passed to `Intl`, to a
// content dictionary or to an `hreflang` tag. Twenty copies means
// twenty opportunities to diverge — and as many places to touch up the day
// a third language arrives. Now there is only one.

// Type guard: is the value a locale served by the site?
// Use it when an unknown locale must be REJECTED (layout 404),
// rather than mapped to the default language.
export function isSupportedLocale(
  value: string | null | undefined,
): value is Locale {
  return hasLocale(routing.locales, value);
}

// Falls back to the default language: use it wherever an unknown locale
// should simply be replaced (metadata, date formats, content).
export function resolveLocale(value: string | null | undefined): Locale {
  return isSupportedLocale(value) ? value : routing.defaultLocale;
}

// BCP-47 TAG FOR `Intl` — and the reason comes down to a single digit.
//
// `new Intl.DateTimeFormat('ar').format(...)` returns "٢٠٢٦": ICU associates
// Arabic WITHOUT A REGION with the Eastern Arabic numeral system. The rest of the site
// writes its numbers in Western Arabic digits — the Barometer scores
// are literals ('0.86'), the counters come from the database, and the
// stylesheet sets `font-variant-numeric: lining-nums`, which controls the
// SHAPE of Latin digits and converts no numeral system. An Arabic page
// would therefore show "٢٠٢٦" as a date and "0.86" as a score, in the same
// table.
//
// `ar-MA` removes the ambiguity: Morocco — like the rest of the Maghreb, the area targeted
// by this language — writes digits in Western form, and ICU knows it. The
// same reasoning applies to `en-GB`, already used by the calendar to
// get "14 November" rather than "November 14".
//
// Every value passed to `Intl` goes through this function. It is not a
// stylistic precaution: two numeral systems in the same page is a
// defect nobody sees until they read the page in Arabic.
// `fr` and `en` stay WITHOUT A REGION, and that is not an oversight. Adding one
// changes existing outputs: `en-GB` removes the Oxford comma from
// `Intl.ListFormat` ("A, B and C" instead of "A, B, and C"), which
// `src/lib/publications.test.ts` explicitly pins as the intended rule.
// This table is here to fix the Arabic DIGITS problem, not to
// re-judge the typography of the two languages already served.
//
// `es-ES` and `pt-PT`, on the other hand, carry a region: these catalogues are
// written in European Spanish and European Portuguese, and dates may as well
// follow the same register as the text around them.
const INTL_TAGS: Record<Locale, string> = {
  fr: 'fr',
  en: 'en',
  es: 'es-ES',
  pt: 'pt-PT',
  ar: 'ar-MA',
};

export function intlLocale(value: string | null | undefined): string {
  return INTL_TAGS[resolveLocale(value)];
}

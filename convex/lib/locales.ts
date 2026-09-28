import { v } from 'convex/values';

// THE LANGUAGES SERVED BY THE SITE — single declaration on the Convex side.
//
// This module contains ONLY that, and that is its reason to exist: the
// validator lived in `convex/schema.ts`, which was fine as long as nothing
// else needed it. `convex/lib/translation.ts` needs it AND is
// imported by the schema (for the `contentTranslations` table): the two
// files would have imported each other, and the validator would have been
// `undefined` when the schema is evaluated. An import cycle does not break
// at compile time — it breaks at startup, with a message that does not name
// the cause.
//
// MIRROR of `routing.locales` (src/i18n/routing.ts): Convex is deployed
// separately and has no `@/` alias, so the copy is imposed by the
// architecture. `tests/unit/i18n-locales.test.ts` compares the two lists
// so that they cannot silently diverge.
//
// Widening this union is backward compatible: documents already written
// only carry the previous values.
export const SITE_LOCALES = ['fr', 'en', 'es', 'pt', 'ar'] as const;

export type SiteLocale = (typeof SITE_LOCALES)[number];

export const locale = v.union(
  v.literal('fr'),
  v.literal('en'),
  v.literal('es'),
  v.literal('pt'),
  v.literal('ar'),
);

// `Intl` TAG PER LANGUAGE — mirror of `INTL_TAGS` (src/i18n/locale.ts).
//
// Same constraint as above: Convex has no `@/` alias, so the copy
// is imposed. It is used by transactional e-mails, which format dates
// server-side and cannot borrow the site's formatter.
//
// The regional choices are the site's, and they MUST stay so:
// `ar-MA` serves Western Arabic numerals, so that an event reminder
// does not announce "٢٠٢٦" when the event page says "2026". And
// `fr`/`en` stay without a region — `en-GB` would remove the Oxford comma
// that `Intl.ListFormat` produces elsewhere on the site.
//
// `tests/unit/i18n-locales.test.ts` compares the two tables, as it already
// compares the two language lists.
const INTL_TAGS: Record<SiteLocale, string> = {
  fr: 'fr',
  en: 'en',
  es: 'es-ES',
  pt: 'pt-PT',
  ar: 'ar-MA',
};

/** The `Intl` tag corresponding to a site language. */
export function intlTag(loc: SiteLocale): string {
  return INTL_TAGS[loc];
}

/** Is the language written right to left? */
export function isRtlLocale(loc: SiteLocale): boolean {
  return loc === 'ar';
}

import { v, type Infer } from 'convex/values';
import { SITE_LOCALES, type SiteLocale } from '../locales';

// TRANSLATABLE TEXTS OF EDITORIAL CONTENT ("contenus" workstream).
//
// A translatable field is an object with five OPTIONAL keys, one per site
// language. Why this shape rather than a separate translations table:
// editorial content is always read in ONE language, with fallback — reading it
// from a single document, without a join, keeps public screens at one index
// read. And an editor who translates an event edits that very document; the
// translation has no life of its own to track.
//
// Why optional: content may be born in French only. The
// missing language is not an error, it is a state — which the back office
// flags (`missingLocales`) and which the site fills with the FALLBACK below.

// The five keys are written out explicitly (and not derived from `SITE_LOCALES`) so
// that the inferred type is exact; `tests/unit/contenus-i18n.test.ts` checks
// that they do cover the site's languages.
export const localizedText = v.object({
  fr: v.optional(v.string()),
  en: v.optional(v.string()),
  es: v.optional(v.string()),
  pt: v.optional(v.string()),
  ar: v.optional(v.string()),
});
export type LocalizedText = Infer<typeof localizedText>;

// List of translatable paragraphs (a theme's positions, questions).
export const localizedList = v.object({
  fr: v.optional(v.array(v.string())),
  en: v.optional(v.array(v.string())),
  es: v.optional(v.array(v.string())),
  pt: v.optional(v.array(v.string())),
  ar: v.optional(v.array(v.string())),
});
export type LocalizedList = Infer<typeof localizedList>;

// FALLBACK ORDER: the requested language, then French (the network's writing
// language and the site's default language), then English, then the first
// language filled in. An Arabic-speaking visitor thus sees a French title
// rather than an empty card — and the back office tells them it is missing.
const FALLBACK_ORDER: readonly SiteLocale[] = ['fr', 'en', 'es', 'pt', 'ar'];

function filled(s: string | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

/** The text in the requested language, or its fallback; `''` if nothing was entered. */
export function pickText(
  text: LocalizedText | undefined,
  locale: SiteLocale,
): string {
  if (!text) return '';
  if (filled(text[locale])) return text[locale];
  for (const l of FALLBACK_ORDER) if (filled(text[l])) return text[l];
  return '';
}

/** The language ACTUALLY served by `pickText` (for the `lang` attribute). */
export function pickedLocale(
  text: LocalizedText | undefined,
  locale: SiteLocale,
): SiteLocale {
  if (!text || filled(text[locale])) return locale;
  for (const l of FALLBACK_ORDER) if (filled(text[l])) return l;
  return locale;
}

export function pickList(
  list: LocalizedList | undefined,
  locale: SiteLocale,
): string[] {
  if (!list) return [];
  const own = list[locale];
  if (own && own.some(filled)) return own.filter(filled);
  for (const l of FALLBACK_ORDER) {
    const other = list[l];
    if (other && other.some(filled)) return other.filter(filled);
  }
  return [];
}

/** Languages without text — the back office's "traduction manquante" indicator. */
export function missingLocales(
  text: LocalizedText | LocalizedList | undefined,
): SiteLocale[] {
  return SITE_LOCALES.filter((l) => {
    const value = text?.[l];
    if (Array.isArray(value)) return !value.some(filled);
    return !filled(value);
  });
}

/** At least one language filled in. */
export function hasAnyLocale(
  text: LocalizedText | LocalizedList | undefined,
): boolean {
  return missingLocales(text).length < SITE_LOCALES.length;
}

/**
 * Cleans up an entered translatable text: leading/trailing whitespace removed, empty
 * languages dropped, length BOUNDED per language (an editor is trusted, but not a
 * 1 MB document pasted by mistake — Convex's limit is per document).
 */
export function cleanText(
  text: LocalizedText | undefined,
  max: number,
): LocalizedText {
  const out: LocalizedText = {};
  if (!text) return out;
  for (const l of SITE_LOCALES) {
    const value = text[l]?.trim();
    if (!value) continue;
    if (value.length > max) throw new Error('TEXT_TOO_LONG');
    out[l] = value;
  }
  return out;
}

export function cleanList(
  list: LocalizedList | undefined,
  maxItems: number,
  maxItemLength: number,
): LocalizedList {
  const out: LocalizedList = {};
  if (!list) return out;
  for (const l of SITE_LOCALES) {
    const items = (list[l] ?? []).map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) continue;
    if (items.length > maxItems) throw new Error('TEXT_TOO_LONG');
    if (items.some((s) => s.length > maxItemLength))
      throw new Error('TEXT_TOO_LONG');
    out[l] = items;
  }
  return out;
}

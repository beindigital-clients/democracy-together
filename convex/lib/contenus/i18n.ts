import { v, type Infer } from 'convex/values';
import { SITE_LOCALES, type SiteLocale } from '../locales';

// TEXTES TRADUISIBLES DES CONTENUS ÉDITORIAUX (chantier « contenus »).
//
// Un champ traduisible est un objet à cinq clés OPTIONNELLES, une par langue
// du site. Pourquoi cette forme plutôt qu'une table de traductions à part :
// un contenu éditorial se lit toujours dans UNE langue, avec repli — le lire
// d'un seul document, sans jointure, garde les écrans publics à une lecture
// d'index. Et un éditeur qui traduit un événement modifie ce document-là ; la
// traduction n'a pas de vie propre à suivre.
//
// Pourquoi optionnelles : un contenu peut naître en français seulement. La
// langue manquante n'est pas une erreur, c'est un état — que le back-office
// signale (`missingLocales`) et que le site comble par le REPLI ci-dessous.

// Les cinq clés sont écrites en clair (et non dérivées de `SITE_LOCALES`) pour
// que le type inféré soit exact ; `tests/unit/contenus-i18n.test.ts` vérifie
// qu'elles couvrent bien les langues du site.
export const localizedText = v.object({
  fr: v.optional(v.string()),
  en: v.optional(v.string()),
  es: v.optional(v.string()),
  pt: v.optional(v.string()),
  ar: v.optional(v.string()),
});
export type LocalizedText = Infer<typeof localizedText>;

// Liste de paragraphes traduisibles (positions d'une thématique, questions).
export const localizedList = v.object({
  fr: v.optional(v.array(v.string())),
  en: v.optional(v.array(v.string())),
  es: v.optional(v.array(v.string())),
  pt: v.optional(v.array(v.string())),
  ar: v.optional(v.array(v.string())),
});
export type LocalizedList = Infer<typeof localizedList>;

// ORDRE DU REPLI : la langue demandée, puis le français (langue de rédaction
// du réseau et langue par défaut du site), puis l'anglais, puis la première
// langue renseignée. Un visiteur arabophone voit donc un titre français
// plutôt qu'une carte vide — et le back-office lui dit qu'il manque.
const FALLBACK_ORDER: readonly SiteLocale[] = ['fr', 'en', 'es', 'pt', 'ar'];

function filled(s: string | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

/** Le texte dans la langue demandée, ou son repli ; `''` si rien n'est saisi. */
export function pickText(
  text: LocalizedText | undefined,
  locale: SiteLocale,
): string {
  if (!text) return '';
  if (filled(text[locale])) return text[locale];
  for (const l of FALLBACK_ORDER) if (filled(text[l])) return text[l];
  return '';
}

/** La langue EFFECTIVEMENT servie par `pickText` (pour l'attribut `lang`). */
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

/** Langues sans texte — l'indicateur « traduction manquante » du back-office. */
export function missingLocales(
  text: LocalizedText | LocalizedList | undefined,
): SiteLocale[] {
  return SITE_LOCALES.filter((l) => {
    const value = text?.[l];
    if (Array.isArray(value)) return !value.some(filled);
    return !filled(value);
  });
}

/** Au moins une langue renseignée. */
export function hasAnyLocale(
  text: LocalizedText | LocalizedList | undefined,
): boolean {
  return missingLocales(text).length < SITE_LOCALES.length;
}

/**
 * Nettoie un texte traduisible saisi : espaces de bord retirés, langues vides
 * supprimées, longueur BORNÉE par langue (un éditeur est de confiance, pas un
 * document de 1 Mo collé par erreur — la limite de Convex est par document).
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

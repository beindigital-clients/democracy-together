import { v } from 'convex/values';

// LES LANGUES SERVIES PAR LE SITE — déclaration unique côté Convex.
//
// Ce module ne contient QUE cela, et c'est la raison de son existence : le
// validateur vivait dans `convex/schema.ts`, ce qui a suffi tant que rien
// d'autre n'en avait besoin. `convex/lib/translation.ts` en a besoin ET est
// importé par le schéma (pour la table `contentTranslations`) : les deux
// fichiers se seraient importés l'un l'autre, et le validateur aurait été
// `undefined` au moment où le schéma s'évalue. Un cycle d'imports ne casse pas
// à la compilation — il casse au démarrage, avec un message qui ne nomme pas
// la cause.
//
// MIROIR de `routing.locales` (src/i18n/routing.ts) : Convex est déployé
// séparément et n'a pas l'alias `@/`, la recopie est donc imposée par
// l'architecture. `tests/unit/i18n-locales.test.ts` compare les deux listes
// pour qu'elles ne puissent pas diverger en silence.
//
// Élargir cette union est rétrocompatible : les documents déjà écrits ne
// portent que les valeurs d'avant.
export const SITE_LOCALES = ['fr', 'en', 'es', 'pt', 'ar'] as const;

export type SiteLocale = (typeof SITE_LOCALES)[number];

export const locale = v.union(
  v.literal('fr'),
  v.literal('en'),
  v.literal('es'),
  v.literal('pt'),
  v.literal('ar'),
);

// ÉTIQUETTE `Intl` PAR LANGUE — miroir de `INTL_TAGS` (src/i18n/locale.ts).
//
// Même contrainte que ci-dessus : Convex n'a pas l'alias `@/`, donc la recopie
// est imposée. Elle sert aux e-mails transactionnels, qui formatent des dates
// côté serveur et ne peuvent pas emprunter le formateur du site.
//
// Les arbitrages régionaux sont ceux du site, et il FAUT qu'ils le restent :
// `ar-MA` sert des chiffres arabes occidentaux, pour ne pas qu'un rappel
// d'événement annonce « ٢٠٢٦ » quand la page de l'événement dit « 2026 ». Et
// `fr`/`en` restent sans région — `en-GB` supprimerait la virgule d'Oxford
// qu'`Intl.ListFormat` produit ailleurs dans le site.
//
// `tests/unit/i18n-locales.test.ts` compare les deux tables, comme il compare
// déjà les deux listes de langues.
const INTL_TAGS: Record<SiteLocale, string> = {
  fr: 'fr',
  en: 'en',
  es: 'es-ES',
  pt: 'pt-PT',
  ar: 'ar-MA',
};

/** L'étiquette `Intl` correspondant à une langue du site. */
export function intlTag(loc: SiteLocale): string {
  return INTL_TAGS[loc];
}

/** La langue s'écrit-elle de droite à gauche ? */
export function isRtlLocale(loc: SiteLocale): boolean {
  return loc === 'ar';
}

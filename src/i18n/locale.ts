import { hasLocale } from 'next-intl';
import { routing, type Locale } from './routing';

// Normalisation d'une chaîne de langue vers une locale du site.
//
// Cette fonction était réécrite à l'identique dans 20 fichiers (issue #41) :
// chaque segment `[locale]` d'URL arrive en `string` et doit être ramené au
// vocabulaire fermé de `routing.locales` avant d'être passé à `Intl`, à un
// dictionnaire de contenu ou à une balise `hreflang`. Vingt copies, c'est
// vingt occasions de diverger — et autant d'endroits à retoucher le jour où
// une troisième langue arrive. Il n'y en a plus qu'un.

// Garde de type : la valeur est-elle une locale servie par le site ?
// À utiliser quand une locale inconnue doit être REFUSÉE (404 du layout),
// plutôt que ramenée à la langue par défaut.
export function isSupportedLocale(
  value: string | null | undefined,
): value is Locale {
  return hasLocale(routing.locales, value);
}

// Repli sur la langue par défaut : à utiliser partout où une locale inconnue
// doit simplement être remplacée (métadonnées, formats de date, contenus).
export function resolveLocale(value: string | null | undefined): Locale {
  return isSupportedLocale(value) ? value : routing.defaultLocale;
}

// ÉTIQUETTE BCP-47 POUR `Intl` — et la raison tient dans un seul chiffre.
//
// `new Intl.DateTimeFormat('ar').format(...)` rend « ٢٠٢٦ » : l'ICU associe à
// l'arabe SANS RÉGION le système de numération arabo-indien. Le reste du site
// écrit ses nombres en chiffres arabes occidentaux — les scores du Baromètre
// sont des littéraux ('0.86'), les compteurs viennent de la base, et la
// feuille de style pose `font-variant-numeric: lining-nums`, qui règle le
// DESSIN des chiffres latins et ne convertit aucun système. Une page arabe
// afficherait donc « ٢٠٢٦ » en date et « 0.86 » en score, dans le même
// tableau.
//
// `ar-MA` lève l'ambiguïté : le Maroc — comme le reste du Maghreb, zone visée
// par cette langue — écrit les chiffres en occidental, et l'ICU le sait. Le
// même raisonnement vaut pour `en-GB`, déjà employé par le calendrier pour
// obtenir « 14 November » plutôt que « November 14 ».
//
// Toute valeur passée à `Intl` traverse cette fonction. Ce n'est pas une
// précaution de style : deux systèmes de numération dans une même page est un
// défaut que personne ne voit avant de lire la page en arabe.
// `fr` et `en` restent SANS RÉGION, et ce n'est pas un oubli. Les y ajouter
// change des sorties existantes : `en-GB` supprime la virgule d'Oxford de
// `Intl.ListFormat` (« A, B and C » au lieu de « A, B, and C »), que
// `src/lib/publications.test.ts` fixe explicitement comme la règle voulue.
// Cette table est là pour régler le problème des CHIFFRES arabes, pas pour
// rejuger la typographie des deux langues déjà servies.
//
// `es-ES` et `pt-PT` portent en revanche une région : ces catalogues sont
// rédigés en espagnol d'Espagne et en portugais européen, et autant que les
// dates suivent le même registre que le texte qui les entoure.
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

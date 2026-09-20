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

// Validation partagée — côté Convex (serveur). L'équivalent client vit dans
// src/lib/validation.ts (la frontière Convex/Next interdit un module unique :
// garder les deux synchrones).
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Longueur maximale d'une adresse, RFC 5321 § 4.5.3.1.3 (chemin de retour :
// 256 octets, crochets compris — soit 254 caractères d'adresse).
//
// POURQUOI ICI, et pas dans chaque formulaire. L'expression ci-dessus accepte
// « a...a@b...b.c » de n'importe quelle longueur : le pentest du 18/09 (M-2,
// point « remplissage ») relevait des soumissions jusqu'à ~1 Mo sur les
// formulaires publics. Borner à cet endroit couvre d'un coup les sept qui
// passent par `isEmail` — contact, newsletter, adhésion, événements, rappels,
// jeunes, mentorat — au lieu de sept corrections à tenir synchrones.
export const EMAIL_MAX_LENGTH = 254;

export function isEmail(value: string): boolean {
  const v = value.trim();
  return v.length <= EMAIL_MAX_LENGTH && EMAIL_RE.test(v);
}

// Bornes des champs LIBRES des formulaires publics (pentest M-2, point
// « remplissage » : « aucune longueur max sur contact, storeApplication […]
// jusqu'à ~1 Mo par soumission »). Les valeurs sont celles que le pentest
// proposait lui-même — 120 / 200 / 4000.
//
// `youth`, `mentorship` et `events` bornaient déjà leurs champs avec les mêmes
// nombres, écrits en clair ; `contact`, `organizations` et l'adresse
// e-mail ne bornaient rien. Les constantes sont ici pour que la prochaine
// addition n'ait pas à les redeviner.
export const FIELD_MAX = {
  name: 120,
  subject: 200,
  body: 4000,
  country: 120,
} as const;

// Schémas acceptés pour une ADRESSE DE SITE (pentest M-9, côté écriture).
//
// `websiteUrl` d'une fiche d'annuaire n'était contraint que par `v.string()` :
// n'importe quelle chaîne entrait en base, et la fiche publique la posait
// telle quelle dans un `href`. Le filtre de rendu (src/lib/safe-href.ts) reste
// nécessaire — il couvre les fiches enregistrées avant cette validation — mais
// laisser entrer `data:text/html;…` pour ne le retenir qu'à l'affichage
// reviendrait à stocker une charge utile en attendant le prochain écran qui
// oubliera de la filtrer.
//
// Plus restrictif que la liste du rendu, et volontairement : `mailto:` y est
// autorisé pour un lien de texte riche, mais le champ nommé « site web » d'une
// organisation ne l'est pas.
const SCHEMAS_SITE = ['http:', 'https:'];

export function isHttpUrl(value: string): boolean {
  let url: URL;
  try {
    // Sans base : une adresse de site est ABSOLUE. `institut-x.org` sans
    // schéma est refusé — c'est une saisie incomplète, pas un lien.
    url = new URL(value.trim());
  } catch {
    return false;
  }
  return SCHEMAS_SITE.includes(url.protocol);
}

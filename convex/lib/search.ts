// Termes de recherche des listes du back-office (issue #49).
//
// Le terme vient du CLIENT, comme `paginationOpts.numItems` : il est normalisé
// ICI, une fois, pour les quatre listes — plutôt que quatre fois avec quatre
// nuances. Trois décisions, toutes prises côté serveur :
//
//  1. PLANCHER. Une recherche d'un seul caractère remonte quasiment toute la
//     table : c'est la lecture que #8 vient de supprimer, rhabillée en
//     recherche. Le plancher de 2 est celui de `globalSearch` (F-06) — même
//     produit, même seuil.
//  2. PLAFOND. Un terme de 100 000 caractères se découpe en autant de termes à
//     apparier. Comme pour la taille de page, le client ne fixe pas la borne.
//  3. VIDE = ABSENT. Une chaîne blanche ne déclenche PAS de recherche : la
//     liste retombe sur son index habituel (celui qui porte son tri), au lieu
//     de passer par l'index plein texte pour n'y rien filtrer. C'est ce qui
//     rend `undefined` et `''` strictement équivalents pour l'appelant, donc
//     l'UI n'a pas à effacer l'argument pour revenir à la liste complète.
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;

export function normalizeSearchTerm(
  raw: string | undefined,
): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length < SEARCH_MIN_LENGTH) return undefined;
  return trimmed.slice(0, SEARCH_MAX_LENGTH);
}

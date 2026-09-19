// Vocabulaire des THÉMATIQUES — déclaration unique, logique pure (issue #30).
//
// Le projet manipule DEUX vocabulaires distincts, que leur nom commun `THEMES`
// a longtemps confondus :
//
//  - les **axes du réseau** (ce fichier) : les 5 axes sur lesquels se rangent
//    une publication, un billet de Tribune, un appel à projets, un espace de
//    travail. Ils étaient recopiés à l'identique dans convex/projects.ts,
//    convex/tribune.ts, convex/workspaces.ts et convex/lib/publications.ts ;
//  - les **thématiques de l'annuaire** (convex/lib/directory.ts, renommées
//    `DIRECTORY_THEMES`) : 10 domaines d'expertise déclarés par un think tank.
//
// Les deux listes n'ont ni la même taille ni les mêmes valeurs : les fusionner
// casserait l'annuaire. Elles ne se synchronisent donc PAS entre elles — mais
// chacune n'est plus déclarée qu'une fois, ce qui est le seul point qui compte.
//
// Les valeurs sont des *slugs* neutres stockés en base ; les libellés sont
// traduits côté Next (messages `library.themes`). Garder cette liste synchrone
// avec src/messages/*.json.

import { v } from 'convex/values';

export const NETWORK_THEMES = [
  'gouvernance-numerique',
  'participation',
  'anti-corruption',
  'transitions',
  'crises',
] as const;

export type NetworkTheme = (typeof NETWORK_THEMES)[number];

// Garde de type : `NETWORK_THEMES.includes(x)` ne se laisse pas appeler avec un
// `string` (la liste est `as const`, donc son élément est un type littéral).
// Passer par cette fonction évite un cast à chaque point d'appel et donne au
// compilateur le rétrécissement de type qu'un cast lui ferait perdre.
export function isNetworkTheme(value: string): value is NetworkTheme {
  return (NETWORK_THEMES as readonly string[]).includes(value);
}

// Validateur d'argument pour un axe du réseau. Construit ici plutôt que recopié
// à chaque query : ajouter un axe à NETWORK_THEMES l'ouvre partout d'un coup.
export const networkThemeValidator = v.union(
  ...NETWORK_THEMES.map((t) => v.literal(t)),
);

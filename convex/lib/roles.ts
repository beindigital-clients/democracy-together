// Vocabulaire des rôles réseau (F-02) — SOURCE UNIQUE, backend ET interface.
//
// Ce module est volontairement PUR : il n'importe aucun type serveur Convex,
// ce qui permet à `src/lib/roles.ts` de l'importer par l'alias `@convex/*`
// (comme l'UI le fait déjà pour le vocabulaire de l'annuaire). L'autorisation
// serveur (`requireNetworkRole`) et l'affichage lisent donc LA MÊME
// hiérarchie et LA MÊME valeur par défaut.

export const ROLE_ORDER = [
  'visiteur',
  'membre',
  'moderateur',
  'editeur',
  'admin',
] as const;

export type NetworkRole = (typeof ROLE_ORDER)[number];

// Un compte authentifié sans rôle explicite vaut « visiteur » (modèle
// d'adhésion B) : l'auto-inscription donne un compte de base ; les droits
// « membre » (dépôt de publications…) ne sont accordés qu'après validation
// d'une candidature d'adhésion (organizations.reviewApplication).
//
// L'UNIQUE écriture de cette valeur dans le dépôt. Le back-office la
// réécrivait de son côté en « membre » (issue #27) : /admin/utilisateurs
// annonçait donc à l'administrateur un droit de dépôt que le serveur refuse,
// sur l'écran même où il décide qui a accès à quoi. Tout code qui a besoin du
// rôle d'un compte passe par `effectiveRole` — jamais par un littéral de repli.
export const DEFAULT_ROLE = 'visiteur' satisfies NetworkRole;

export function isNetworkRole(role: unknown): role is NetworkRole {
  return (ROLE_ORDER as readonly unknown[]).includes(role);
}

// Rôle effectif d'un compte : celui que le RBAC serveur applique réellement.
// Une valeur absente — ou hors hiérarchie, ce que le validateur de schéma
// interdit mais qui reste possible sur une donnée héritée — retombe sur le
// rôle le MOINS privilégié, jamais sur un rôle supérieur.
export function effectiveRole(role: string | null | undefined): NetworkRole {
  return isNetworkRole(role) ? role : DEFAULT_ROLE;
}

// Rang hiérarchique : un rôle accorde aussi les droits des rôles inférieurs.
export function roleRank(role: string | null | undefined): number {
  return ROLE_ORDER.indexOf(effectiveRole(role));
}

// Hiérarchie des rôles réseau — SOURCE UNIQUE côté client (Next).
// Le module serveur `convex/lib/rbac.ts` ne peut pas être importé ici (il tire
// des types serveur Convex) : garder cette liste SYNCHRONE avec lui.
// L'autorisation réelle reste serveur (requireNetworkRole) ; ceci ne pilote que
// l'affichage (gate UI, liens staff).
export const ROLE_ORDER = [
  'visiteur',
  'membre',
  'moderateur',
  'editeur',
  'admin',
] as const;

export type NetworkRole = (typeof ROLE_ORDER)[number];

export function roleRank(role: string | null | undefined): number {
  return ROLE_ORDER.indexOf((role ?? 'visiteur') as NetworkRole);
}

// Membre validé et au-dessus (peut déposer des publications). Voir le modèle
// d'adhésion B : l'auto-inscription donne « visiteur », pas « membre ».
export function isMember(role: string | null | undefined): boolean {
  return roleRank(role) >= ROLE_ORDER.indexOf('membre');
}

export function isStaff(role: string | null | undefined): boolean {
  return roleRank(role) >= ROLE_ORDER.indexOf('moderateur');
}

// Éditeur et au-dessus (gère les contenus éditoriaux, ex. campagnes newsletter).
export function isEditor(role: string | null | undefined): boolean {
  return roleRank(role) >= ROLE_ORDER.indexOf('editeur');
}

export function isAdmin(role: string | null | undefined): boolean {
  return roleRank(role) >= ROLE_ORDER.indexOf('admin');
}

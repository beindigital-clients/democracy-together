// Rôles réseau côté interface.
//
// Le vocabulaire, la valeur par défaut et le calcul du rang viennent de
// `convex/lib/roles.ts` — module PUR (aucun type serveur Convex), importé ici
// par l'alias `@convex/*` comme l'UI le fait déjà pour le vocabulaire de
// l'annuaire. Ce fichier n'en redéclare donc plus rien : l'affichage et
// l'autorisation serveur ne peuvent plus diverger, et la décision « pas de
// rôle = visiteur » n'est écrite qu'à un seul endroit du dépôt (issue #27).
//
// L'autorisation réelle reste serveur (requireNetworkRole) ; ce qui suit ne
// pilote que l'affichage (gate UI, liens staff).
import { ROLE_ORDER, roleRank } from '@convex/lib/roles';

export {
  ROLE_ORDER,
  DEFAULT_ROLE,
  effectiveRole,
  isNetworkRole,
  roleRank,
} from '@convex/lib/roles';
export type { NetworkRole } from '@convex/lib/roles';

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

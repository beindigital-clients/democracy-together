// Network roles, UI side.
//
// The vocabulary, the default value and the rank computation come from
// `convex/lib/roles.ts` — a PURE module (no Convex server types), imported here
// through the `@convex/*` alias as the UI already does for the directory
// vocabulary. This file therefore redeclares none of it: display and server
// authorization can no longer diverge, and the "no role = visitor" decision
// is written in only one place in the repo (issue #27).
//
// Real authorization stays server-side (requireNetworkRole); what follows
// only drives display (UI gate, staff links).
import {
  ROLE_ORDER,
  roleRank,
  canValidatePublications,
} from '@convex/lib/roles';

export {
  ROLE_ORDER,
  DEFAULT_ROLE,
  effectiveRole,
  isNetworkRole,
  roleRank,
  canValidatePublications,
} from '@convex/lib/roles';
export type { NetworkRole } from '@convex/lib/roles';

// Validated member and above (can submit publications). See membership
// model B: self-registration grants "visiteur", not "membre".
export function isMember(role: string | null | undefined): boolean {
  return roleRank(role) >= ROLE_ORDER.indexOf('membre');
}

export function isStaff(role: string | null | undefined): boolean {
  return roleRank(role) >= ROLE_ORDER.indexOf('moderateur');
}

// Editor and above (manages editorial content, e.g. newsletter campaigns).
export function isEditor(role: string | null | undefined): boolean {
  return roleRank(role) >= ROLE_ORDER.indexOf('editeur');
}

export function isAdmin(role: string | null | undefined): boolean {
  return roleRank(role) >= ROLE_ORDER.indexOf('admin');
}

// Review chief (KOHOP): the function granted by an administrator on top of a
// staff rank. Display only — the server guard is `requireReviewChief`.
export function isReviewChief(account: {
  role?: string | null;
  reviewChief?: boolean | null;
}): boolean {
  return canValidatePublications(account);
}

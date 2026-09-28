// Vocabulary of network roles (F-02) — SINGLE SOURCE, backend AND interface.
//
// This module is deliberately PURE: it imports no Convex server type, which
// lets `src/lib/roles.ts` import it through the `@convex/*` alias (as the UI
// already does for the directory vocabulary). Server authorisation
// (`requireNetworkRole`) and display therefore read THE SAME hierarchy and
// THE SAME default value.

export const ROLE_ORDER = [
  'visiteur',
  'membre',
  'moderateur',
  'editeur',
  'admin',
] as const;

export type NetworkRole = (typeof ROLE_ORDER)[number];

// An authenticated account without an explicit role counts as "visitor"
// (membership model B): self-registration gives a basic account; "member"
// rights (submitting publications…) are only granted after a membership
// application is approved (organizations.reviewApplication).
//
// The ONLY place this value is written in the repo. The back office used to
// rewrite it on its own as "member" (issue #27): /admin/utilisateurs thus
// told the administrator about a submission right the server refuses, on the
// very screen where they decide who has access to what. Any code that needs
// an account's role goes through `effectiveRole` — never through a fallback
// literal.
export const DEFAULT_ROLE = 'visiteur' satisfies NetworkRole;

export function isNetworkRole(role: unknown): role is NetworkRole {
  return (ROLE_ORDER as readonly unknown[]).includes(role);
}

// Effective role of an account: the one the server RBAC actually enforces.
// A missing value — or one outside the hierarchy, which the schema validator
// forbids but which remains possible on legacy data — falls back to the
// LEAST privileged role, never to a higher one.
export function effectiveRole(role: string | null | undefined): NetworkRole {
  return isNetworkRole(role) ? role : DEFAULT_ROLE;
}

// Hierarchical rank: a role also grants the rights of lower roles.
export function roleRank(role: string | null | undefined): number {
  return ROLE_ORDER.indexOf(effectiveRole(role));
}

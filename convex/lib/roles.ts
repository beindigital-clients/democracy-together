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

// REVIEW CHIEF (KOHOP, batch 0) — a FUNCTION, not a rank.
//
// The review chief and the administrator are the only accounts that validate
// a publication, in the library as on KOHOP. The function is granted by an
// administrator (`users.setReviewChief`) and only makes sense for a staff
// account: a review chief is part of the team, hence goes through the same
// second factor as any moderator and above.
//
// PURE and shared with the UI, like the rest of this module: the screens that
// show or hide a decision button read THIS function, the server guard
// (`requireReviewChief`) reads it too.
export function canValidatePublications(account: {
  role?: string | null;
  reviewChief?: boolean | null;
}): boolean {
  if (effectiveRole(account.role) === 'admin') return true;
  return (
    account.reviewChief === true &&
    roleRank(account.role) >= ROLE_ORDER.indexOf('moderateur')
  );
}

// AMI (Cercle des Amis) — a STATUS, not a rank.
//
// Decision (docs/cercle-amis.md): an Ami is NOT inserted in `ROLE_ORDER`.
// Every existing guard reads the rank (`requireNetworkRole(ctx, 'membre')`
// accepts anything from `membre` up), so an extra rank between `visiteur` and
// `membre` would have been silently accepted or refused by dozens of call
// sites written before it existed. A separate flag leaves all of them exactly
// as they were: an Ami is a `visiteur` for the whole platform, and gains ONE
// thing — the Cercle's private space.
//
// PURE and shared with the UI, like the rest of this module: the screens that
// show the Cercle space read THIS function, the server guard
// (`requireCercleAccess`) reads it too.
export function isAmi(account: { amiSince?: number | null }): boolean {
  return typeof account.amiSince === 'number';
}

// Who may enter the Cercle's private space: the Amis and every validated
// member or above (members already belong to the network, they do not need a
// second request). A visitor without the Ami status never does.
export function hasCercleAccess(account: {
  role?: string | null;
  amiSince?: number | null;
}): boolean {
  return (
    isAmi(account) || roleRank(account.role) >= ROLE_ORDER.indexOf('membre')
  );
}

// HOW MUCH of the Cercle an account may do — the EXTENSION POINT for what the
// plan leaves for later (docs/cercle-amis.md § 8): an Ami sponsored by an
// existing Ami could start READ-ONLY, and become `write` once their first
// contributions are reviewed.
//
// Today every Ami and every member and above is `write`, and nobody else has
// anything: this is `hasCercleAccess` under a name that can say more. All the
// Cercle's doors already ask for one of the two levels (`requireCercleAccess`
// takes `read` or `write`), so adding a restricted entry level later is ONE
// change here — a field on the account and a branch below — and no door has to
// be revisited. Nothing reads such a field yet: it is not built.
export type CercleAccessLevel = 'none' | 'read' | 'write';

export function cercleAccessLevel(account: {
  role?: string | null;
  amiSince?: number | null;
}): CercleAccessLevel {
  return hasCercleAccess(account) ? 'write' : 'none';
}

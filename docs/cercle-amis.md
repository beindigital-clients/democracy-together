# Cercle des Amis — decisions and hand-over notes

Working notes for the "Cercle des Amis" workstream (plan of 2026-11-12, section
A). Each section is written when its feature lands. Everything marked **to
confirm** is awaited from the client (Philippe Kourilsky) and is a placeholder
in the code.

## 1. The "Ami" status — extra role or separate status?

**Decision: a separate status** (`users.amiSince`, plus `users.amiGrantedBy`),
not a new value in `ROLE_ORDER`.

Why:

- Every access guard in the repo reads the **rank** (`requireNetworkRole(ctx,
  'membre')` accepts `membre` and everything above it, ~35 call sites in
  workspaces, tribune, KOHOP, publications, payments…). A rank inserted between
  `visiteur` and `membre` would be silently accepted or refused by dozens of
  call sites written before it existed. The failure mode is a leak, which is
  the one thing this workstream must not produce.
- With a flag, an Ami is a `visiteur` for the whole platform. Nothing that
  already exists changes. The status opens ONE thing: the Cercle's private
  space (`hasCercleAccess`, `requireCercleAccess`).
- A member can hold the status too (granted before they became a member, or
  kept after): it adds nothing on top of the rank, and withdrawing it never
  lowers a member. `cercle.access` reports such an account as `member`.
- Suspension needs no extra code: `requireCercleAccess` is built on
  `requireUser`, which already refuses a suspended account.

Single source: `convex/lib/roles.ts` (`isAmi`, `hasCercleAccess`), shared with
the UI through the `@convex/*` alias. The server guard is
`requireCercleAccess` / `getCercleUser` (`convex/lib/rbac.ts`).

Granting and withdrawing: `users.setAmi` (administrator, audited as
`user.ami_granted` / `user.ami_revoked`), a switch on `/admin/utilisateurs`.
A Cercle request approval (feature 2) grants it too.

Proof: `convex/cercle-access.test.ts` — matrix of anonymous / visitor / Ami /
member / moderator / editor / admin against rank-guarded doors (an Ami must not
pass any) and against the Cercle's own doors (an Ami must pass). New Cercle
functions are added to `CERCLE_PROBES` in that file.
E2E: `tests/e2e/cercle-ami-admin.spec.ts`.

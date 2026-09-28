import { describe, it, expect } from 'vitest';
import * as shared from '@convex/lib/roles';
import {
  ROLE_ORDER,
  DEFAULT_ROLE,
  effectiveRole,
  roleRank,
  isMember,
  isStaff,
  isEditor,
  isAdmin,
} from '@/lib/roles';

// Default role: a SINGLE definition in the repo (issue #27).
//
// The back office derived its own default — "membre" — while the server-side RBAC
// treats the absence of a role as "visiteur". /admin/utilisateurs,
// the screen where you decide who has access to what, thus advertised a submission right
// that the server refuses; and since its <Select> was controlled on that value,
// the administrator could "confirm" a role nobody had set.
//
// What prevents reintroduction is not fixing the literal, it is
// that only one copy of the derivation now exists. This file
// checks that where it can be checked: the UI and the backend reference the SAME
// function, not two copies that would have to be kept in sync.
describe('Rôles — source unique UI/backend', () => {
  it("l'UI réexporte la dérivation du backend, elle n'en écrit pas une seconde", () => {
    expect(effectiveRole).toBe(shared.effectiveRole);
    expect(roleRank).toBe(shared.roleRank);
    expect(ROLE_ORDER).toBe(shared.ROLE_ORDER);
    expect(DEFAULT_ROLE).toBe(shared.DEFAULT_ROLE);
  });

  it('un compte sans rôle vaut « visiteur » côté interface aussi', () => {
    expect(effectiveRole(undefined)).toBe('visiteur');
    expect(effectiveRole(null)).toBe('visiteur');
    expect(roleRank(undefined)).toBe(roleRank('visiteur'));
  });

  // The crux of the matter: without a role, the account has NO member rights.
  // Displaying "membre" amounted to promising the opposite of what the
  // server does (publication submission, writing on the Tribune).
  it('sans rôle, les gardes UI refusent comme le serveur', () => {
    expect(isMember(undefined)).toBe(false);
    expect(isStaff(undefined)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
    expect(isMember('membre')).toBe(true);
  });
});

// The back office's four display guards (issue #42). The above
// checks where the hierarchy comes from; what follows checks what each guard
// derives from it. `isEditor` was exercised nowhere, and it is what decides
// access to newsletter campaigns — the screen that WRITES to the outside world.
//
// The matrix is written out in full, role by role, rather than as chosen cases:
// a guard is almost always wrong by ONE cell (a `>` instead of a `>=`,
// a neighboring rank), and that is exactly what a set of well-chosen examples
// lets through.
const MATRICE: Array<
  [
    role: string,
    membre: boolean,
    staff: boolean,
    editeur: boolean,
    admin: boolean,
  ]
> = [
  ['visiteur', false, false, false, false],
  ['membre', true, false, false, false],
  ['moderateur', true, true, false, false],
  ['editeur', true, true, true, false],
  ['admin', true, true, true, true],
];

describe('Gardes UI — la matrice complète des quatre rôles', () => {
  it('couvre tout le vocabulaire (aucun rôle oublié par la matrice)', () => {
    expect(MATRICE.map(([r]) => r)).toEqual([...ROLE_ORDER]);
  });

  it.each(MATRICE)(
    '%s : membre=%s staff=%s editeur=%s admin=%s',
    (role, membre, staff, editeur, admin) => {
      expect(isMember(role)).toBe(membre);
      expect(isStaff(role)).toBe(staff);
      expect(isEditor(role)).toBe(editeur);
      expect(isAdmin(role)).toBe(admin);
    },
  );

  // The trap in this hierarchy: it is LINEAR. "modérateur" and
  // "éditeur" read like two parallel jobs, but the editor is
  // above — they also moderate, and the moderator does not edit.
  it('la hiérarchie est linéaire : éditeur > modérateur, pas à côté', () => {
    expect(isStaff('editeur')).toBe(true);
    expect(isEditor('moderateur')).toBe(false);
  });

  // Fail-closed: an unknown role must NEVER open a screen. The schema
  // validator forbids it on write, but legacy data, a casing
  // mistake or a role removed from the vocabulary do make it this far.
  it.each(['', 'root', 'superadmin', 'Admin', 'ADMIN', 'admin ', 'éditeur'])(
    'refuse tout avec le rôle inconnu %o',
    (role) => {
      expect(isMember(role)).toBe(false);
      expect(isStaff(role)).toBe(false);
      expect(isEditor(role)).toBe(false);
      expect(isAdmin(role)).toBe(false);
    },
  );

  // The guards receive the role from a Convex query, which returns `undefined`
  // while loading and `null` for an account without a role: both must
  // close, and above all not throw in the middle of a render.
  it.each([null, undefined])('refuse tout avec %o', (role) => {
    expect(isEditor(role)).toBe(false);
    expect(isAdmin(role)).toBe(false);
  });
});

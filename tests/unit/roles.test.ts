import { describe, it, expect } from 'vitest';
import * as shared from '@convex/lib/roles';
import {
  ROLE_ORDER,
  DEFAULT_ROLE,
  effectiveRole,
  roleRank,
  isMember,
  isStaff,
  isAdmin,
} from '@/lib/roles';

// Rôle par défaut : UNE seule écriture dans le dépôt (issue #27).
//
// Le back-office dérivait son propre défaut — « membre » — quand le RBAC
// serveur traite l'absence de rôle comme « visiteur ». /admin/utilisateurs,
// l'écran où l'on décide qui a accès à quoi, annonçait donc un droit de dépôt
// que le serveur refuse ; et son <Select> étant contrôlé sur cette valeur,
// l'administrateur pouvait « confirmer » un rôle que personne n'avait posé.
//
// Ce qui empêche la réintroduction n'est pas la correction du littéral, c'est
// qu'il n'existe plus qu'un seul exemplaire de la dérivation. Ce fichier le
// vérifie là où c'est vérifiable : l'UI et le backend référencent la MÊME
// fonction, pas deux copies qu'il faudrait garder synchrones.
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

  // Le fond de l'affaire : sans rôle, le compte n'a AUCUN droit de membre.
  // Afficher « membre » revenait à promettre l'inverse de ce que fait le
  // serveur (dépôt de publication, écriture sur la Tribune).
  it('sans rôle, les gardes UI refusent comme le serveur', () => {
    expect(isMember(undefined)).toBe(false);
    expect(isStaff(undefined)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
    expect(isMember('membre')).toBe(true);
  });
});

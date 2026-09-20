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

// Les quatre gardes d'affichage du back-office (issue #42). Ce qui précède
// vérifie d'où vient la hiérarchie ; ce qui suit vérifie ce que chaque garde en
// tire. `isEditor` n'était exercée nulle part, et c'est elle qui décide de
// l'accès aux campagnes de newsletter — l'écran qui ÉCRIT vers l'extérieur.
//
// La matrice est écrite en entier, rôle par rôle, plutôt qu'en cas choisis :
// une garde se trompe presque toujours d'UNE case (un `>` au lieu d'un `>=`,
// un rang voisin), et c'est exactement ce qu'un jeu d'exemples bien choisis
// laisse passer.
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

  // Le piège de cette hiérarchie : elle est LINÉAIRE. « modérateur » et
  // « éditeur » se lisent comme deux métiers parallèles, mais l'éditeur est
  // au-dessus — il modère aussi, et le modérateur n'édite pas.
  it('la hiérarchie est linéaire : éditeur > modérateur, pas à côté', () => {
    expect(isStaff('editeur')).toBe(true);
    expect(isEditor('moderateur')).toBe(false);
  });

  // Fail-closed : un rôle inconnu ne doit JAMAIS ouvrir un écran. Le validateur
  // de schéma l'interdit en écriture, mais une donnée héritée, une faute de
  // casse ou un rôle retiré du vocabulaire arrivent bien jusqu'ici.
  it.each(['', 'root', 'superadmin', 'Admin', 'ADMIN', 'admin ', 'éditeur'])(
    'refuse tout avec le rôle inconnu %o',
    (role) => {
      expect(isMember(role)).toBe(false);
      expect(isStaff(role)).toBe(false);
      expect(isEditor(role)).toBe(false);
      expect(isAdmin(role)).toBe(false);
    },
  );

  // Les gardes reçoivent le rôle d'une requête Convex, qui rend `undefined`
  // pendant le chargement et `null` sur un compte sans rôle : les deux doivent
  // fermer, et surtout ne pas lever au milieu d'un rendu.
  it.each([null, undefined])('refuse tout avec %o', (role) => {
    expect(isEditor(role)).toBe(false);
    expect(isAdmin(role)).toBe(false);
  });
});

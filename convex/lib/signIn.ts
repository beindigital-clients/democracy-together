import type { GenericDatabaseReader } from 'convex/server';
import { ConvexError } from 'convex/values';
import type { DataModel, Id } from '../_generated/dataModel';

// Décision d'entrée sur la plateforme (F-01) — le corps du callback
// `createOrUpdateUser` de convex/auth.ts, extrait ici.
//
// C'est le chemin LE PLUS CHAUD du backend : il s'exécute à chaque tentative de
// connexion, et c'est lui qui tient la règle « pas d'auto-inscription » — un
// e-mail inconnu ne crée aucun compte, il est refusé (NO_SELF_SIGNUP).
//
// Deux raisons de le sortir de auth.ts, sous la forme d'une fonction qui reçoit
// `db` plutôt qu'un `ctx` :
//
// 1. LECTURE INDEXÉE. Convex Auth type le ctx de ses callbacks sur
//    `GenericMutationCtx<AnyDataModel>` : un modèle générique qui ne déclare
//    que les index SYSTÈME (`by_id`, `by_creation_time`). `withIndex('email')`
//    n'y compilait pas — d'où le `collect()+find()` d'origine, qui lisait la
//    table `users` ENTIÈRE à chaque connexion. Le manque était purement
//    STATIQUE : l'index `email` existe bel et bien (cf. schema.ts) et Convex le
//    résout par son NOM, à l'exécution, contre le schéma déployé. Il suffit
//    donc de reprendre `db` ici, typé sur le `DataModel` du projet, pour que
//    l'index redevienne visible du compilateur — sans cast, parce que le
//    modèle générique de la bibliothèque est assignable à celui-ci, et sans
//    rien changer au runtime. Le typage n'est pas décoratif : renommer l'index
//    dans schema.ts casse désormais `pnpm typecheck:convex`. La même lecture
//    tourne déjà ailleurs (`devAdmin.setRoleByEmail`, `users.inviteUser`).
//
// 2. TESTS. auth.ts touche `process.env` au chargement : il est exclu du glob
//    `import.meta.glob` de tous les fichiers de test (cf. TESTING.md). La
//    décision qui garde l'entrée de la plateforme n'était donc couverte par
//    rien ; ici, elle se teste telle quelle (convex/auth-callback.test.ts).

export async function resolveSignInUserId(
  db: GenericDatabaseReader<DataModel>,
  email: string | undefined,
): Promise<Id<'users'>> {
  // Égalité EXACTE sur l'adresse, comme le `find()` qu'elle remplace : on ne
  // normalise pas ici, ce serait élargir ce que le callback accepte. Les
  // comptes sont créés avec une adresse déjà normalisée — invitation (F-63),
  // approbation d'adhésion (F-22) et amorçage admin passent tous par
  // `normalizeEmail()`, précisément pour que cette lecture les retrouve.
  //
  // `.first()` et non `.unique()` : si deux lignes partageaient une adresse,
  // l'ancien `find()` rendait la plus ancienne ; l'index, qui ordonne à égalité
  // par `_creationTime`, rend la même. Un refus ne doit pas se transformer en
  // erreur de lecture.
  const existing = email
    ? await db
        .query('users')
        .withIndex('email', (q) => q.eq('email', email))
        .first()
    : null;
  if (existing) return existing._id;
  throw new ConvexError('NO_SELF_SIGNUP');
}

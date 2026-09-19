// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { resolveSignInUserId } from './lib/signIn';

// Le callback `createOrUpdateUser` de convex/auth.ts garde l'entrée de toute la
// plateforme : compte existant -> connexion ; e-mail inconnu -> refus
// (NO_SELF_SIGNUP, modèle d'adhésion validée). Rien ne le couvrait — auth.ts
// touche `process.env` au chargement et reste exclu du glob ci-dessous (cf.
// TESTING.md). Sa décision vit donc dans lib/signIn.ts, et c'est elle qu'on
// exerce ici, telle que le callback l'appelle.
//
// Deux propriétés à tenir :
//   1. LA RÈGLE — elle ne change pas d'un iota (issue #29, contrainte).
//   2. LE COÛT — la lecture passe par l'index `email` de `users`. Le callback
//      lisait la table ENTIÈRE (`collect()+find()`) à chaque tentative de
//      connexion : sur le chemin le plus chaud du backend, facturé à la donnée
//      lue, c'était le pire endroit où laisser ce motif.

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

const MEMBRE = 'membre@institut-sahel.org';
const INCONNU = 'inconnu@example.org';

describe('Connexion — décision du callback createOrUpdateUser (F-01)', () => {
  it('laisse entrer un compte existant (le nouveau moyen de connexion y est relié)', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', { email: MEMBRE, role: 'membre' }),
    );

    expect(await t.run((ctx) => resolveSignInUserId(ctx.db, MEMBRE))).toBe(
      userId,
    );
  });

  it("refuse un e-mail inconnu et ne crée aucun compte (pas d'auto-inscription)", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('users', { email: MEMBRE, role: 'membre' }),
    );

    // `.data` plutôt que le message : c'est lui qui traverse jusqu'au client.
    await expect(
      t.run((ctx) => resolveSignInUserId(ctx.db, INCONNU)),
    ).rejects.toMatchObject({ data: 'NO_SELF_SIGNUP' });

    // Le refus ne doit RIEN écrire : un e-mail inconnu repart sans compte.
    expect(await t.run((ctx) => ctx.db.query('users').collect())).toHaveLength(
      1,
    );
  });

  it('refuse un identifiant sans e-mail', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('users', { email: MEMBRE, role: 'membre' }),
    );

    await expect(
      t.run((ctx) => resolveSignInUserId(ctx.db, undefined)),
    ).rejects.toMatchObject({ data: 'NO_SELF_SIGNUP' });
  });

  it('lit par index : le coût de la connexion ne suit pas la taille de `users`', async () => {
    // `transactionLimits` plafonne les documents lus par transaction (une vraie
    // limite Convex, ici resserrée). Avec 60 comptes en base, la lecture
    // indexée en lit UN ; le `collect()` d'avant les lirait tous les 61 et la
    // transaction échouerait. C'est CE test qui mord si le scan revient — les
    // trois précédents passeraient encore.
    const t = convexTest({
      schema,
      modules,
      transactionLimits: { documentsRead: 5 },
    });
    const userId = await t.run(async (ctx) => {
      for (let i = 0; i < 60; i++) {
        await ctx.db.insert('users', {
          email: `membre-${i}@reseau.test`,
          role: 'membre',
        });
      }
      return await ctx.db.insert('users', { email: MEMBRE, role: 'membre' });
    });

    // Connexion acceptée…
    expect(await t.run((ctx) => resolveSignInUserId(ctx.db, MEMBRE))).toBe(
      userId,
    );
    // …et refus : lui non plus ne scanne pas (sinon l'erreur levée serait celle
    // de la limite de lecture, sans `.data`).
    await expect(
      t.run((ctx) => resolveSignInUserId(ctx.db, INCONNU)),
    ).rejects.toMatchObject({ data: 'NO_SELF_SIGNUP' });
  });
});

// auth.ts ne peut pas être importé ici : on lit sa SOURCE, comme
// dev-oracles.test.ts le fait pour les oracles DEV. C'est la seule façon de
// tenir la promesse de l'issue #29 — plus aucun scan complet de `users` sur le
// chemin de connexion — pour le fichier que les tests ci-dessus n'atteignent
// pas. Un `collect()` réintroduit dans le callback passerait le typecheck.
const authSource = (
  import.meta.glob('/convex/auth.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
)['/convex/auth.ts'];

describe('Chemin de connexion — aucune lecture non indexée de `users`', () => {
  it('le callback délègue la décision, il ne requête plus `users` lui-même', () => {
    expect(authSource).toContain('resolveSignInUserId');
    expect(authSource).not.toMatch(/query\(['"]users['"]\)/);
  });
});

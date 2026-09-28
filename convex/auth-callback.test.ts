// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { resolveSignInUserId } from './lib/signIn';

// The `createOrUpdateUser` callback in convex/auth.ts guards the entrance to the whole
// platform: existing account -> sign-in; unknown email -> refusal
// (NO_SELF_SIGNUP, approved-membership model). Nothing covered it — auth.ts
// touches `process.env` on load and stays excluded from the glob below (see
// TESTING.md). Its decision therefore lives in lib/signIn.ts, and that is what we
// exercise here, as the callback calls it.
//
// Two properties to uphold:
//   1. THE RULE — it does not change one iota (issue #29, constraint).
//   2. THE COST — the read goes through the `email` index of `users`. The callback
//      read the ENTIRE table (`collect()+find()`) on every sign-in
//      attempt: on the hottest path of the backend, billed by data
//      read, it was the worst place to leave that pattern.

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

  it('relie un mot de passe à un compte invité SANS toucher à son rôle ni à son profil (R-05)', async () => {
    // This is the path of the member area's "set my password" screen:
    // `signIn('password', { flow: 'signUp' })` on the address of a
    // provisioned account goes through `createAccount`, hence through this callback. It
    // must return the EXISTING identifier — Convex Auth then merely
    // inserts the `authAccounts` row — and rewrite nothing: a moderator
    // role reverting to "visiteur" when setting a password
    // would be a silent regression.
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', {
        email: MEMBRE,
        role: 'moderateur',
        name: 'Awa Diop',
        preferredLocale: 'pt',
      }),
    );
    const avant = await t.run((ctx) => ctx.db.get(userId));

    expect(await t.run((ctx) => resolveSignInUserId(ctx.db, MEMBRE))).toBe(
      userId,
    );

    const apres = await t.run((ctx) => ctx.db.get(userId));
    expect(apres).toEqual(avant);
    expect(apres?.role).toBe('moderateur');
    // And no second account was born from the linking.
    expect(await t.run((ctx) => ctx.db.query('users').collect())).toHaveLength(
      1,
    );
  });

  it("refuse un e-mail inconnu et ne crée aucun compte (pas d'auto-inscription)", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('users', { email: MEMBRE, role: 'membre' }),
    );

    // `.data` rather than the message: it is what travels through to the client.
    await expect(
      t.run((ctx) => resolveSignInUserId(ctx.db, INCONNU)),
    ).rejects.toMatchObject({ data: 'NO_SELF_SIGNUP' });

    // The refusal must write NOTHING: an unknown email leaves without an account.
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
    // `transactionLimits` caps the documents read per transaction (a real
    // Convex limit, tightened here). With 60 accounts in the database, the indexed
    // read reads ONE; the previous `collect()` would read all 61 and the
    // transaction would fail. It is THIS test that bites if the scan comes back — the
    // three previous ones would still pass.
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

    // Sign-in accepted…
    expect(await t.run((ctx) => resolveSignInUserId(ctx.db, MEMBRE))).toBe(
      userId,
    );
    // …and refusal: it does not scan either (otherwise the thrown error would be the
    // read limit's, without `.data`).
    await expect(
      t.run((ctx) => resolveSignInUserId(ctx.db, INCONNU)),
    ).rejects.toMatchObject({ data: 'NO_SELF_SIGNUP' });
  });
});

// auth.ts cannot be imported here: we read its SOURCE, as
// dev-oracles.test.ts does for the DEV oracles. It is the only way to
// keep the promise of issue #29 — no more full scan of `users` on the
// sign-in path — for the file the tests above do not reach.
// A `collect()` reintroduced in the callback would pass the typecheck.
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

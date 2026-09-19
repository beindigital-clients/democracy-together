// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

const APP = {
  name: 'Awa Diop',
  email: '  Awa@Example.org ',
  country: 'Sénégal',
  motivation: 'Je veux contribuer aux travaux du réseau sur la participation.',
};

describe('Jeunes — candidature (F-58)', () => {
  it('candidate (normalise), dédupe les pending, rejette les invalides', async () => {
    const t = convexTest(schema, modules);

    const r1 = await t.mutation(internal.youth.storeApplication, APP);
    expect(r1.already).toBe(false);

    const all = await t.run((ctx) =>
      ctx.db.query('youthApplications').collect(),
    );
    expect(all).toHaveLength(1);
    expect(all[0].email).toBe('awa@example.org');
    expect(all[0].status).toBe('pending');

    // une 2e candidature en attente avec le même e-mail = dédoublonnée
    const r2 = await t.mutation(internal.youth.storeApplication, {
      ...APP,
      email: 'awa@example.org',
    });
    expect(r2.already).toBe(true);
    expect(
      (await t.run((ctx) => ctx.db.query('youthApplications').collect()))
        .length,
    ).toBe(1);

    // invalides
    await expect(
      t.mutation(internal.youth.storeApplication, {
        ...APP,
        email: 'pas-un-email',
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.youth.storeApplication, {
        ...APP,
        email: 'b@x.org',
        motivation: 'court',
      }),
    ).rejects.toThrow();
  });
});

describe('Jeunes — back-office (F-58)', () => {
  it('réserve la liste et la revue aux modérateurs', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.youth.storeApplication, {
      ...APP,
      email: 'a@test.org',
    });

    // anonyme + visiteur refusés
    await expect(
      t.query(api.youth.listYouthApplications, {}),
    ).rejects.toThrow();
    const vId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${vId}|s` })
        .query(api.youth.listYouthApplications, {}),
    ).rejects.toThrow();

    // modérateur : liste + revue
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const asMod = t.withIdentity({ subject: `${modId}|s` });
    const list = await asMod.query(api.youth.listYouthApplications, {});
    expect(list).toHaveLength(1);

    await asMod.mutation(api.youth.reviewYouthApplication, {
      applicationId: list[0]._id,
      decision: 'approved',
    });
    const pending = await asMod.query(api.youth.listYouthApplications, {
      status: 'pending',
    });
    expect(pending).toHaveLength(0);
    const approved = await asMod.query(api.youth.listYouthApplications, {
      status: 'approved',
    });
    expect(approved).toHaveLength(1);
  });
});

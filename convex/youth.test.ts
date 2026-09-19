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

describe('Jeunes — machine à états de la revue (issue #9)', () => {
  // Une candidature en attente + un modérateur.
  async function setup() {
    const t = convexTest(schema, modules);
    await t.mutation(internal.youth.storeApplication, {
      ...APP,
      email: 'jeune@example.org',
    });
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const [application] = await t.run((ctx) =>
      ctx.db.query('youthApplications').collect(),
    );
    return {
      t,
      modId,
      asMod: t.withIdentity({ subject: `${modId}|s` }),
      applicationId: application._id,
    };
  }

  const auditOf = (t: ReturnType<typeof convexTest>, action: string) =>
    t.run((ctx) =>
      ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) => q.eq('action', action))
        .collect(),
    );

  it('refuse le rejeu et l’inversion d’une décision', async () => {
    const { t, asMod, applicationId } = await setup();
    await asMod.mutation(api.youth.reviewYouthApplication, {
      applicationId,
      decision: 'approved',
      notes: 'Profil pertinent.',
    });

    // rejeu (double clic) puis inversion (l'autre bouton) : les deux refusés
    for (const decision of ['approved', 'rejected'] as const) {
      await expect(
        asMod.mutation(api.youth.reviewYouthApplication, {
          applicationId,
          decision,
        }),
      ).rejects.toThrow('ALREADY_REVIEWED');
    }

    // La candidature est intacte, et le journal ne porte qu'UNE décision : le
    // throw annule la transaction, ligne d'audit comprise. C'est tout l'enjeu
    // — un historique qui empile des décisions contradictoires ne dit plus
    // laquelle fait foi.
    const doc = await t.run((ctx) => ctx.db.get(applicationId));
    expect(doc?.status).toBe('approved');
    expect(doc?.reviewNotes).toBe('Profil pertinent.');
    expect(await auditOf(t, 'youth.reviewed')).toHaveLength(1);
  });

  it('réouverture : transition nommée, tracée, puis nouvelle décision', async () => {
    const { t, modId, asMod, applicationId } = await setup();
    await asMod.mutation(api.youth.reviewYouthApplication, {
      applicationId,
      decision: 'rejected',
      notes: 'Erreur de bouton.',
    });

    // réservée au staff
    const vId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${vId}|s` })
        .mutation(api.youth.reopenYouthApplication, { applicationId }),
    ).rejects.toThrow();

    await asMod.mutation(api.youth.reopenYouthApplication, { applicationId });
    expect(await t.run((ctx) => ctx.db.get(applicationId))).toMatchObject({
      status: 'pending',
    });

    // le retour en arrière a SON action d'audit : dans le journal, on le
    // distingue d'une seconde revue.
    const reopened = await auditOf(t, 'youth.reopened');
    expect(reopened).toHaveLength(1);
    expect(reopened[0].actorId).toBe(modId);
    expect(reopened[0].metadata).toMatchObject({ from: 'rejected' });

    // rouvrir deux fois de suite n'a pas de sens : la candidature est déjà
    // dans la file.
    await expect(
      asMod.mutation(api.youth.reopenYouthApplication, { applicationId }),
    ).rejects.toThrow('INVALID_TRANSITION');

    // et la décision redevient possible, une fois.
    await asMod.mutation(api.youth.reviewYouthApplication, {
      applicationId,
      decision: 'approved',
    });
    expect(await t.run((ctx) => ctx.db.get(applicationId))).toMatchObject({
      status: 'approved',
    });
  });
});

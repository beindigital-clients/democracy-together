// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import { FIELD_MAX } from './lib/validation';

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

    // a 2nd pending application with the same email = deduplicated
    const r2 = await t.mutation(internal.youth.storeApplication, {
      ...APP,
      email: 'awa@example.org',
    });
    expect(r2.already).toBe(true);
    expect(
      (await t.run((ctx) => ctx.db.query('youthApplications').collect()))
        .length,
    ).toBe(1);

    // invalid
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

    // anonymous + visitor rejected
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

    // moderator: list + review
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
  // A pending application + a moderator.
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

    // replay (double click) then reversal (the other button): both rejected
    for (const decision of ['approved', 'rejected'] as const) {
      await expect(
        asMod.mutation(api.youth.reviewYouthApplication, {
          applicationId,
          decision,
        }),
      ).rejects.toThrow('ALREADY_REVIEWED');
    }

    // The application is intact, and the log holds only ONE decision: the
    // throw cancels the transaction, audit row included. That is the whole point
    // — a history that piles up contradictory decisions no longer says
    // which one is authoritative.
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

    // reserved for staff
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
    // The "pending" counter counts it again (issue #8): without this call in
    // the mutation, the dashboard would display an empty queue.
    const pending = await t.run((ctx) =>
      ctx.db
        .query('counters')
        .withIndex('by_key', (q) => q.eq('key', 'youthApplications.pending'))
        .unique(),
    );
    expect(pending?.value).toBe(1);

    // going back has ITS OWN audit action: in the log, it is
    // distinguished from a second review.
    const reopened = await auditOf(t, 'youth.reopened');
    expect(reopened).toHaveLength(1);
    expect(reopened[0].actorId).toBe(modId);
    expect(reopened[0].metadata).toMatchObject({ from: 'rejected' });

    // reopening twice in a row makes no sense: the application is already
    // in the queue.
    await expect(
      asMod.mutation(api.youth.reopenYouthApplication, { applicationId }),
    ).rejects.toThrow('INVALID_TRANSITION');

    // and the decision becomes possible again, once.
    await asMod.mutation(api.youth.reviewYouthApplication, {
      applicationId,
      decision: 'approved',
    });
    expect(await t.run((ctx) => ctx.db.get(applicationId))).toMatchObject({
      status: 'approved',
    });
  });
});

// A-04: a 5,000-character motivation was rejected under "L'envoi a
// échoué" — the code did not travel through. It now does (`data`), and the bound is
// the one the form displays (`FIELD_MAX.body`).
describe('Jeunes — refus de longueur lisible par le formulaire (A-04)', () => {
  it('INVALID_MOTIVATION porte son code dans `data`, la borne exacte passe', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.youth.storeApplication, {
        ...APP,
        motivation: 'a'.repeat(FIELD_MAX.body + 1),
      }),
    ).rejects.toMatchObject({ data: 'INVALID_MOTIVATION' });
    const r = await t.mutation(internal.youth.storeApplication, {
      ...APP,
      motivation: 'a'.repeat(FIELD_MAX.body),
    });
    expect(r.already).toBe(false);
  });
});

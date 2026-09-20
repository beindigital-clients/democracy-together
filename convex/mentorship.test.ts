// @vitest-environment edge-runtime
import { describe, it, expect, beforeEach } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import frMessages from '../src/messages/fr.json';
import enMessages from '../src/messages/en.json';

const frMentorship = (frMessages as Record<string, unknown>).mentorship;
const enMentorship = (enMessages as Record<string, unknown>).mentorship;

// Déterminisme : pas de fournisseur e-mail pendant les tests.
beforeEach(() => {
  process.env.AUTH_EMAIL_PROVIDER = 'none';
});

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

const REQ = {
  name: 'Awa Diop',
  email: '  Awa@Example.org ',
  country: 'Sénégal',
  role: 'mentore' as const,
  message: 'Je cherche un accompagnement sur la participation citoyenne.',
};

describe('Mentorat — demande (F-59)', () => {
  it('crée (normalise e-mail), dédoublonne par rôle, rejette les invalides', async () => {
    const t = convexTest(schema, modules);

    const r1 = await t.mutation(internal.mentorship.storeRequest, REQ);
    expect(r1.already).toBe(false);

    const all = await t.run((ctx) =>
      ctx.db.query('mentorshipRequests').collect(),
    );
    expect(all).toHaveLength(1);
    expect(all[0].email).toBe('awa@example.org');
    expect(all[0].status).toBe('pending');
    expect(all[0].role).toBe('mentore');

    // 2e demande pending, même e-mail + même rôle = dédoublonnée
    const r2 = await t.mutation(internal.mentorship.storeRequest, {
      ...REQ,
      email: 'awa@example.org',
    });
    expect(r2.already).toBe(true);
    expect(
      (await t.run((ctx) => ctx.db.query('mentorshipRequests').collect()))
        .length,
    ).toBe(1);

    // même e-mail mais AUTRE rôle (mentor) = autorisé (pas un doublon)
    const r3 = await t.mutation(internal.mentorship.storeRequest, {
      ...REQ,
      email: 'awa@example.org',
      role: 'mentor',
    });
    expect(r3.already).toBe(false);
    expect(
      (await t.run((ctx) => ctx.db.query('mentorshipRequests').collect()))
        .length,
    ).toBe(2);

    // invalides
    await expect(
      t.mutation(internal.mentorship.storeRequest, {
        ...REQ,
        email: 'pas-un-email',
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.mentorship.storeRequest, {
        ...REQ,
        email: 'b@x.org',
        message: 'court',
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.mentorship.storeRequest, {
        ...REQ,
        email: 'c@x.org',
        name: 'A',
      }),
    ).rejects.toThrow();
  });
});

describe('Mentorat — back-office (F-59)', () => {
  it('réserve la liste et la revue aux modérateurs, et journalise la revue', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.mentorship.storeRequest, {
      ...REQ,
      email: 'a@test.org',
    });

    // anonyme + visiteur refusés
    await expect(
      t.query(api.mentorship.listMentorshipRequests, {}),
    ).rejects.toThrow();
    const vId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${vId}|s` })
        .query(api.mentorship.listMentorshipRequests, {}),
    ).rejects.toThrow();

    // modérateur : liste + revue (matched)
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const asMod = t.withIdentity({ subject: `${modId}|s` });
    const list = await asMod.query(api.mentorship.listMentorshipRequests, {});
    expect(list).toHaveLength(1);
    expect(list[0].role).toBe('mentore');

    await asMod.mutation(api.mentorship.reviewMentorshipRequest, {
      requestId: list[0]._id,
      status: 'matched',
      notes: 'Apparié à un mentor de Dakar.',
    });

    const pending = await asMod.query(api.mentorship.listMentorshipRequests, {
      status: 'pending',
    });
    expect(pending).toHaveLength(0);
    const matched = await asMod.query(api.mentorship.listMentorshipRequests, {
      status: 'matched',
    });
    expect(matched).toHaveLength(1);

    // trace d'audit écrite
    const audit = await t.run((ctx) =>
      ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) => q.eq('action', 'mentorship.reviewed'))
        .collect(),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].actorId).toBe(modId);
  });

  it('refuse la revue d’une demande inexistante', async () => {
    const t = convexTest(schema, modules);
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'm2@test.org' }),
    );
    const req = await t.mutation(internal.mentorship.storeRequest, {
      ...REQ,
      email: 'z@test.org',
    });
    expect(req.already).toBe(false);
    // un id valide mais d'une autre table -> NOT_FOUND attendu via id inexistant
    const fakeId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('mentorshipRequests', {
        name: 'tmp',
        email: 'tmp@x.org',
        country: 'XX',
        role: 'mentor',
        message: 'temp message long enough',
        status: 'pending',
        createdAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });
    await expect(
      t
        .withIdentity({ subject: `${modId}|s` })
        .mutation(api.mentorship.reviewMentorshipRequest, {
          requestId: fakeId,
          status: 'closed',
        }),
    ).rejects.toThrow();
  });
});

describe('Mentorat — machine à états de la revue (issue #9)', () => {
  async function setup() {
    const t = convexTest(schema, modules);
    await t.mutation(internal.mentorship.storeRequest, {
      ...REQ,
      email: 'demande@example.org',
    });
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const [request] = await t.run((ctx) =>
      ctx.db.query('mentorshipRequests').collect(),
    );
    return {
      t,
      modId,
      asMod: t.withIdentity({ subject: `${modId}|s` }),
      requestId: request._id,
    };
  }

  const auditOf = (t: ReturnType<typeof convexTest>, action: string) =>
    t.run((ctx) =>
      ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) => q.eq('action', action))
        .collect(),
    );

  it('refuse le rejeu, et l’inversion d’une demande close', async () => {
    const { t, asMod, requestId } = await setup();
    await asMod.mutation(api.mentorship.reviewMentorshipRequest, {
      requestId,
      status: 'closed',
    });

    // rejeu (double clic) puis inversion : une demande classée sans suite ne
    // redevient pas « appariée » d'un clic — il faut la rouvrir.
    for (const status of ['closed', 'matched'] as const) {
      await expect(
        asMod.mutation(api.mentorship.reviewMentorshipRequest, {
          requestId,
          status,
        }),
      ).rejects.toThrow('ALREADY_REVIEWED');
    }

    expect(await t.run((ctx) => ctx.db.get(requestId))).toMatchObject({
      status: 'closed',
    });
    expect(await auditOf(t, 'mentorship.reviewed')).toHaveLength(1);
  });

  it('clore un appariement est une SUITE, pas une inversion', async () => {
    const { t, asMod, requestId } = await setup();
    await asMod.mutation(api.mentorship.reviewMentorshipRequest, {
      requestId,
      status: 'matched',
    });
    // La mise en relation a eu lieu, puis l'accompagnement se termine : c'est
    // une transition légitime, et elle laisse sa trace.
    await asMod.mutation(api.mentorship.reviewMentorshipRequest, {
      requestId,
      status: 'closed',
    });
    expect(await t.run((ctx) => ctx.db.get(requestId))).toMatchObject({
      status: 'closed',
    });
    expect(await auditOf(t, 'mentorship.reviewed')).toHaveLength(2);

    // mais on ne revient pas en arrière : re-clore, ou ré-apparier, est refusé
    await expect(
      asMod.mutation(api.mentorship.reviewMentorshipRequest, {
        requestId,
        status: 'matched',
      }),
    ).rejects.toThrow('ALREADY_REVIEWED');
  });

  it('réouverture : transition nommée, tracée, puis nouvelle décision', async () => {
    const { t, modId, asMod, requestId } = await setup();
    await asMod.mutation(api.mentorship.reviewMentorshipRequest, {
      requestId,
      status: 'matched',
    });

    // réservée au staff
    await expect(
      t.mutation(api.mentorship.reopenMentorshipRequest, { requestId }),
    ).rejects.toThrow();

    await asMod.mutation(api.mentorship.reopenMentorshipRequest, { requestId });
    expect(await t.run((ctx) => ctx.db.get(requestId))).toMatchObject({
      status: 'pending',
    });

    const reopened = await auditOf(t, 'mentorship.reopened');
    expect(reopened).toHaveLength(1);
    expect(reopened[0].actorId).toBe(modId);
    expect(reopened[0].metadata).toMatchObject({
      from: 'matched',
      role: 'mentore',
    });

    // rouvrir une demande déjà en attente n'a pas d'objet
    await expect(
      asMod.mutation(api.mentorship.reopenMentorshipRequest, { requestId }),
    ).rejects.toThrow('INVALID_TRANSITION');

    // et la demande se tranche à nouveau
    await asMod.mutation(api.mentorship.reviewMentorshipRequest, {
      requestId,
      status: 'closed',
    });
    expect(await t.run((ctx) => ctx.db.get(requestId))).toMatchObject({
      status: 'closed',
    });
  });
});

describe('Mentorat — contenu éditorial (terme banni)', () => {
  it('n’emploie jamais « démocratie libérale » / « liberal democracy »', () => {
    const blob = JSON.stringify([frMentorship, enMentorship]);
    expect(blob).not.toMatch(/d[ée]mocratie\s+lib[ée]rale/i);
    expect(blob).not.toMatch(/liberal\s+democracy/i);
  });
});

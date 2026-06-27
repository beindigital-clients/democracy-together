// @vitest-environment edge-runtime
import { describe, it, expect, beforeEach } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
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

    const r1 = await t.mutation(api.mentorship.requestMentorship, REQ);
    expect(r1.already).toBe(false);

    const all = await t.run((ctx) =>
      ctx.db.query('mentorshipRequests').collect(),
    );
    expect(all).toHaveLength(1);
    expect(all[0].email).toBe('awa@example.org');
    expect(all[0].status).toBe('pending');
    expect(all[0].role).toBe('mentore');

    // 2e demande pending, même e-mail + même rôle = dédoublonnée
    const r2 = await t.mutation(api.mentorship.requestMentorship, {
      ...REQ,
      email: 'awa@example.org',
    });
    expect(r2.already).toBe(true);
    expect(
      (await t.run((ctx) => ctx.db.query('mentorshipRequests').collect()))
        .length,
    ).toBe(1);

    // même e-mail mais AUTRE rôle (mentor) = autorisé (pas un doublon)
    const r3 = await t.mutation(api.mentorship.requestMentorship, {
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
      t.mutation(api.mentorship.requestMentorship, {
        ...REQ,
        email: 'pas-un-email',
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.mentorship.requestMentorship, {
        ...REQ,
        email: 'b@x.org',
        message: 'court',
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.mentorship.requestMentorship, {
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
    await t.mutation(api.mentorship.requestMentorship, {
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
    const req = await t.mutation(api.mentorship.requestMentorship, {
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
      t.withIdentity({ subject: `${modId}|s` }).mutation(
        api.mentorship.reviewMentorshipRequest,
        { requestId: fakeId, status: 'closed' },
      ),
    ).rejects.toThrow();
  });
});

describe('Mentorat — contenu éditorial (terme banni)', () => {
  it('n’emploie jamais « démocratie libérale » / « liberal democracy »', () => {
    const blob = JSON.stringify([frMentorship, enMentorship]);
    expect(blob).not.toMatch(/d[ée]mocratie\s+lib[ée]rale/i);
    expect(blob).not.toMatch(/liberal\s+democracy/i);
  });
});

// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Sur dépassement, le serveur lève ConvexError('RATE_LIMITED') -> `.data`
// traverse jusqu'à l'appelant (robuste, indépendant du format de message).
async function expectRateLimited(p: Promise<unknown>) {
  await expect(p).rejects.toMatchObject({ data: 'RATE_LIMITED' });
}

const contactMsg = (i: number, email = 'spam@example.org') => ({
  name: 'Awa Diop',
  email,
  subject: `Sujet ${i}`,
  body: `Message numéro ${i}, assez long pour passer la validation.`,
});

describe('Rate-limiting (sécurité, défense en profondeur)', () => {
  it('contact : bloque au-delà de la limite puis se réinitialise après la fenêtre', async () => {
    const t = convexTest(schema, modules);

    // 5 envois valides (même e-mail) passent
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.contact.submit, contactMsg(i));
    }
    // le 6e est bloqué
    await expectRateLimited(t.mutation(api.contact.submit, contactMsg(99)));
    expect(
      await t.run((ctx) => ctx.db.query('contactMessages').collect()),
    ).toHaveLength(5);

    // simule l'expiration de la fenêtre -> nouvel envoi accepté
    await t.run(async (ctx) => {
      const rl = await ctx.db
        .query('rateLimits')
        .withIndex('by_key', (q) => q.eq('key', 'contact:spam@example.org'))
        .unique();
      if (rl) {
        await ctx.db.patch(rl._id, {
          windowStart: rl.windowStart - 2 * 60 * 60 * 1000,
        });
      }
    });
    await t.mutation(api.contact.submit, contactMsg(6));
    expect(
      await t.run((ctx) => ctx.db.query('contactMessages').collect()),
    ).toHaveLength(6);
  });

  it('compteurs indépendants par clé (e-mail)', async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.contact.submit, contactMsg(i, 'a@example.org'));
    }
    // a@ est plein...
    await expectRateLimited(
      t.mutation(api.contact.submit, contactMsg(9, 'a@example.org')),
    );
    // ...mais b@ passe (clé distincte)
    await t.mutation(api.contact.submit, contactMsg(0, 'b@example.org'));
    expect(
      await t.run((ctx) => ctx.db.query('contactMessages').collect()),
    ).toHaveLength(6);
  });

  it('candidature d’adhésion : limitée par e-mail', async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.organizations.submitApplication, {
        type: 'organisation',
        organizationName: `Org ${i}`,
        contactEmail: 'flood@example.org',
        country: 'SN',
      });
    }
    await expectRateLimited(
      t.mutation(api.organizations.submitApplication, {
        type: 'organisation',
        organizationName: 'Org de trop',
        contactEmail: 'flood@example.org',
        country: 'SN',
      }),
    );
  });

  it('dépôt de publication : limité par utilisateur', async () => {
    const t = convexTest(schema, modules);
    const memberId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'm@test.org' }),
    );
    const asMember = t.withIdentity({ subject: `${memberId}|s` });
    const base = {
      type: 'rapport' as const,
      theme: 'participation' as const,
      region: 'afrique' as const,
      languages: ['fr' as const],
      access: 'open' as const,
      year: 2025,
      authors: [{ name: 'A. Wade' }],
      abstract: 'Un résumé suffisamment long pour la validation serveur.',
    };
    for (let i = 0; i < 10; i++) {
      await asMember.mutation(api.publications.submitPublication, {
        ...base,
        title: `Publication numéro ${i}`,
      });
    }
    await expectRateLimited(
      asMember.mutation(api.publications.submitPublication, {
        ...base,
        title: 'Publication de trop',
      }),
    );
  });
});

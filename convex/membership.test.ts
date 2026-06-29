// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { internal } from './_generated/api';

// L'action publique `submitApplication` ajoute la porte reCAPTCHA puis délègue
// à `storeApplication` (internalMutation) où vivent validation, rate-limit et
// liaison user. On teste cette mutation interne directement.

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

const valid = {
  type: 'organisation' as const,
  organizationName: 'Institut Démo',
  contactEmail: 'contact@demo.org',
  country: 'SN',
};

describe('Adhésion — submitApplication validation (F-22)', () => {
  it('rejette nom court, e-mail invalide et pays court', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.organizations.storeApplication, {
        ...valid,
        organizationName: 'A',
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.organizations.storeApplication, {
        ...valid,
        contactEmail: 'pas-un-email',
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.organizations.storeApplication, {
        ...valid,
        country: 'X',
      }),
    ).rejects.toThrow();
    expect(
      await t.run((ctx) => ctx.db.query('membershipApplications').collect()),
    ).toHaveLength(0);
  });

  it('accepte une candidature valide, la marque pending et trime', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.organizations.storeApplication, {
      type: 'individu',
      organizationName: '  Awa Diop  ',
      contactEmail: ' awa@example.org ',
      country: ' SN ',
      message: '   ',
    });
    const all = await t.run((ctx) =>
      ctx.db.query('membershipApplications').collect(),
    );
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('pending');
    expect(all[0].type).toBe('individu');
    expect(all[0].organizationName).toBe('Awa Diop');
    expect(all[0].contactEmail).toBe('awa@example.org');
    expect(all[0].message).toBeUndefined();
  });

  it('lie applicantUserId quand l utilisateur est connecté, sinon non (F-22)', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'connecte@test.org' }),
    );
    await t
      .withIdentity({ subject: `${userId}|s` })
      .mutation(internal.organizations.storeApplication, {
        type: 'organisation',
        organizationName: 'Institut Connecté',
        contactEmail: 'a@b.org',
        country: 'SN',
      });
    await t.mutation(internal.organizations.storeApplication, {
      type: 'organisation',
      organizationName: 'Institut Anonyme',
      contactEmail: 'c@d.org',
      country: 'FR',
    });

    const apps = await t.run((ctx) =>
      ctx.db.query('membershipApplications').collect(),
    );
    const lie = apps.find((a) => a.organizationName === 'Institut Connecté');
    const anon = apps.find((a) => a.organizationName === 'Institut Anonyme');
    expect(lie?.applicantUserId).toBe(userId);
    expect(anon?.applicantUserId).toBeUndefined();
  });
});

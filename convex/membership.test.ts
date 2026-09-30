// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { internal } from './_generated/api';

// The public `submitApplication` action adds the reCAPTCHA gate then
// delegates to `storeApplication` (internalMutation), where validation, rate
// limiting and user linking live. We test that internal mutation directly.

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// The mutations under test schedule e-mails with `runAfter(0)` — receipt,
// staff alert, decline, sign-in invitation — which run once the test lets go
// of the event loop. Left alone, a send logs after its test has ended, and a
// log landing during the file's teardown fails the whole Vitest run (see
// convex/newsletter.test.ts). Each instance is drained before its test ends.
const drains: (() => Promise<void>)[] = [];
function newConvexTest() {
  const t = convexTest(schema, modules);
  drains.push(() => t.finishAllScheduledFunctions(vi.runAllTimers));
  return t;
}
afterEach(async () => {
  vi.useFakeTimers();
  try {
    for (const drain of drains.splice(0)) await drain();
  } finally {
    vi.useRealTimers();
  }
});

const valid = {
  type: 'organisation' as const,
  organizationName: 'Institut Démo',
  contactEmail: 'contact@demo.org',
  country: 'SN',
};

describe('Adhésion — submitApplication validation (F-22)', () => {
  it('rejette nom court, e-mail invalide et pays court', async () => {
    const t = newConvexTest();
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
    const t = newConvexTest();
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
    const t = newConvexTest();
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

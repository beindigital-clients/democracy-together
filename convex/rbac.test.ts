// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import { rank, effectiveRole, DEFAULT_ROLE } from './lib/rbac';
import { effectiveRole as sharedEffectiveRole } from './lib/roles';

// Modules loaded by convex-test. We include _generated (required to locate the
// root) and the generated .js files; we only exclude tests, .d.ts files and the
// auth wiring (auth.config.ts reads process.env, unavailable in edge-runtime).
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

describe('RBAC — hiérarchie des rôles (F-02)', () => {
  it('ordonne les rôles et traite undefined comme « visiteur » (modèle B)', () => {
    expect(rank('visiteur')).toBeLessThan(rank('membre'));
    expect(rank('membre')).toBeLessThan(rank('moderateur'));
    expect(rank('moderateur')).toBeLessThan(rank('editeur'));
    expect(rank('editeur')).toBeLessThan(rank('admin'));
    // Self-signup without an explicit role -> visitor (not member).
    expect(rank(undefined)).toBe(rank('visiteur'));
  });

  // The default value is written only once in the repo
  // (convex/lib/roles.ts). `lib/rbac` RE-EXPORTS it — it does not copy it —
  // and `src/lib/roles.ts` imports the same module on the interface side: this is what
  // prevents the back-office from reintroducing "membre" (issue #27).
  it('dérive le rôle effectif depuis une source unique', () => {
    expect(effectiveRole).toBe(sharedEffectiveRole);
    expect(DEFAULT_ROLE).toBe('visiteur');
    expect(effectiveRole(undefined)).toBe(DEFAULT_ROLE);
    expect(effectiveRole(null)).toBe(DEFAULT_ROLE);
    // Value outside the hierarchy (legacy data): the LEAST privileged, never
    // a higher role.
    expect(effectiveRole('super-admin')).toBe(DEFAULT_ROLE);
    // An explicit role is never rewritten.
    for (const role of ['visiteur', 'membre', 'moderateur', 'editeur', 'admin'])
      expect(effectiveRole(role)).toBe(role);
  });
});

describe('Adhésion — candidature + validation (F-22 / F-26)', () => {
  it('crée une candidature en attente, refuse un membre, accepte un modérateur, audite', async () => {
    const t = newConvexTest();

    const appId = await t.mutation(internal.organizations.storeApplication, {
      type: 'organisation',
      organizationName: 'Institut Test',
      contactEmail: 'contact@test.org',
      country: 'SN',
    });
    expect((await t.run((ctx) => ctx.db.get(appId)))?.status).toBe('pending');

    const memberId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'membre@test.org' }),
    );
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );

    // a member cannot validate
    await expect(
      t
        .withIdentity({ subject: `${memberId}|s` })
        .mutation(api.organizations.reviewApplication, {
          applicationId: appId,
          decision: 'approved',
        }),
    ).rejects.toThrow();

    // a moderator can
    await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.organizations.reviewApplication, {
        applicationId: appId,
        decision: 'approved',
        notes: 'Dossier complet',
      });

    const reviewed = await t.run((ctx) => ctx.db.get(appId));
    expect(reviewed?.status).toBe('approved');
    expect(reviewed?.reviewedBy).toBe(modId);

    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.some((a) => a.action === 'membership.reviewed')).toBe(true);
  });
});

describe('Attribution de rôle (F-63) — admin seulement', () => {
  it('refuse un éditeur, accepte un admin', async () => {
    const t = newConvexTest();
    const editorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'editeur', email: 'ed@test.org' }),
    );
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'admin@test.org' }),
    );
    const targetId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'cible@test.org' }),
    );

    await expect(
      t
        .withIdentity({ subject: `${editorId}|s` })
        .mutation(api.users.setRole, { userId: targetId, role: 'moderateur' }),
    ).rejects.toThrow();

    await t
      .withIdentity({ subject: `${adminId}|s` })
      .mutation(api.users.setRole, { userId: targetId, role: 'moderateur' });

    expect((await t.run((ctx) => ctx.db.get(targetId)))?.role).toBe(
      'moderateur',
    );
  });
});

describe('RBAC — héritage des rôles & rejet anonyme (F-02)', () => {
  it('éditeur hérite de la modération ; anonyme et visiteur sont refusés', async () => {
    const t = newConvexTest();
    const appId = await t.mutation(internal.organizations.storeApplication, {
      type: 'organisation',
      organizationName: 'Institut X',
      contactEmail: 'x@y.org',
      country: 'SN',
    });
    const editorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'editeur', email: 'ed@test.org' }),
    );
    const visitorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'vi@test.org' }),
    );

    // anonymous caller refused (requireUser "Non authentifié" branch)
    await expect(
      t.mutation(api.organizations.reviewApplication, {
        applicationId: appId,
        decision: 'approved',
      }),
    ).rejects.toThrow();

    // visitor refused (rank < moderator)
    await expect(
      t
        .withIdentity({ subject: `${visitorId}|s` })
        .mutation(api.organizations.reviewApplication, {
          applicationId: appId,
          decision: 'approved',
        }),
    ).rejects.toThrow();

    // editor accepted (rank > moderator -> inheritance)
    await t
      .withIdentity({ subject: `${editorId}|s` })
      .mutation(api.organizations.reviewApplication, {
        applicationId: appId,
        decision: 'approved',
      });
    expect((await t.run((ctx) => ctx.db.get(appId)))?.status).toBe('approved');
  });
});

describe('Adhésion — approbation accorde le rôle membre (modèle B)', () => {
  it('approuver une candidature liée à un compte le passe « membre »', async () => {
    const t = newConvexTest();
    const visitorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'cand@test.org' }),
    );
    // application submitted by the signed-in visitor -> applicantUserId linked
    const appId = await t
      .withIdentity({ subject: `${visitorId}|s` })
      .mutation(internal.organizations.storeApplication, {
        type: 'individu',
        organizationName: 'Awa Diop',
        contactEmail: 'cand@test.org',
        country: 'SN',
      });
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.organizations.reviewApplication, {
        applicationId: appId,
        decision: 'approved',
      });
    expect((await t.run((ctx) => ctx.db.get(visitorId)))?.role).toBe('membre');
  });

  it('rejeter n’accorde aucun rôle', async () => {
    const t = newConvexTest();
    const visitorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'cand2@test.org' }),
    );
    const appId = await t
      .withIdentity({ subject: `${visitorId}|s` })
      .mutation(internal.organizations.storeApplication, {
        type: 'individu',
        organizationName: 'X Institut',
        contactEmail: 'cand2@test.org',
        country: 'SN',
      });
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod2@test.org' }),
    );
    await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.organizations.reviewApplication, {
        applicationId: appId,
        decision: 'rejected',
      });
    expect((await t.run((ctx) => ctx.db.get(visitorId)))?.role).toBe(
      'visiteur',
    );
  });
});

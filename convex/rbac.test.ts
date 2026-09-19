// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import { rank } from './lib/rbac';

// Modules chargés par convex-test. On inclut _generated (requis pour situer la
// racine) et les .js générés ; on exclut seulement les tests, les .d.ts et le
// câblage auth (auth.config.ts lit process.env, indispo en edge-runtime).
const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

describe('RBAC — hiérarchie des rôles (F-02)', () => {
  it('ordonne les rôles et traite undefined comme « visiteur » (modèle B)', () => {
    expect(rank('visiteur')).toBeLessThan(rank('membre'));
    expect(rank('membre')).toBeLessThan(rank('moderateur'));
    expect(rank('moderateur')).toBeLessThan(rank('editeur'));
    expect(rank('editeur')).toBeLessThan(rank('admin'));
    // Auto-inscription sans rôle explicite -> visiteur (pas membre).
    expect(rank(undefined)).toBe(rank('visiteur'));
  });
});

describe('Adhésion — candidature + validation (F-22 / F-26)', () => {
  it('crée une candidature en attente, refuse un membre, accepte un modérateur, audite', async () => {
    const t = convexTest(schema, modules);

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

    // un membre ne peut pas valider
    await expect(
      t
        .withIdentity({ subject: `${memberId}|s` })
        .mutation(api.organizations.reviewApplication, {
          applicationId: appId,
          decision: 'approved',
        }),
    ).rejects.toThrow();

    // un modérateur le peut
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
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
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

    // appelant anonyme refusé (branche requireUser « Non authentifié »)
    await expect(
      t.mutation(api.organizations.reviewApplication, {
        applicationId: appId,
        decision: 'approved',
      }),
    ).rejects.toThrow();

    // visiteur refusé (rang < modérateur)
    await expect(
      t
        .withIdentity({ subject: `${visitorId}|s` })
        .mutation(api.organizations.reviewApplication, {
          applicationId: appId,
          decision: 'approved',
        }),
    ).rejects.toThrow();

    // éditeur accepté (rang > modérateur -> héritage)
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
    const t = convexTest(schema, modules);
    const visitorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'cand@test.org' }),
    );
    // candidature déposée par le visiteur connecté -> applicantUserId lié
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
    const t = convexTest(schema, modules);
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

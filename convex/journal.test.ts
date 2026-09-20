// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import { AUDIT } from './lib/auditActions';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Pagination : les listes du back-office prennent désormais `paginationOpts`
// (issue #8). Une page large suffit à ces tests — ce qu'ils vérifient n'est pas
// le découpage mais le contenu.
const PAGE = { paginationOpts: { numItems: 50, cursor: null } };

describe("Journal d'activité (F-67) — listAuditLog", () => {
  it('renvoie les entrées triées desc + résout actorName/actorEmail', async () => {
    const t = convexTest(schema, modules);

    // Acteur connu (résolu via ctx.db.get) + un id d'acteur disparu (null).
    const actorId = await t.run((ctx) =>
      ctx.db.insert('users', {
        role: 'admin',
        name: 'Awa Diop',
        email: 'awa@demo.org',
      }),
    );
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'admin@test.org' }),
    );

    // Trois entrées d'audit, horodatages croissants — l'ordre attendu en
    // sortie est l'inverse (la plus récente d'abord).
    await t.run(async (ctx) => {
      await ctx.db.insert('auditLog', {
        actorId,
        action: AUDIT.USER_ROLE_CHANGED,
        targetId: 'cible-1',
        metadata: { role: 'membre' },
        createdAt: 1_000,
      });
      await ctx.db.insert('auditLog', {
        actorId,
        action: AUDIT.PUBLICATION_REVIEWED,
        targetId: 'cible-2',
        createdAt: 2_000,
      });
      // Entrée sans acteur résoluble (actorId absent) -> actorName/Email null.
      await ctx.db.insert('auditLog', {
        action: AUDIT.MEMBERSHIP_REVIEWED,
        targetId: 'cible-3',
        createdAt: 3_000,
      });
    });

    const { page: rows } = await t
      .withIdentity({ subject: `${adminId}|s` })
      .query(api.journal.listAuditLog, PAGE);

    // Tri décroissant par createdAt.
    expect(rows.map((r) => r.createdAt)).toEqual([3_000, 2_000, 1_000]);
    expect(rows.map((r) => r.action)).toEqual([
      AUDIT.MEMBERSHIP_REVIEWED,
      AUDIT.PUBLICATION_REVIEWED,
      AUDIT.USER_ROLE_CHANGED,
    ]);

    // Acteur résolu sur les deux premières entrées (par createdAt) ...
    const oldest = rows[2];
    expect(oldest.actorName).toBe('Awa Diop');
    expect(oldest.actorEmail).toBe('awa@demo.org');
    expect(oldest.targetId).toBe('cible-1');

    // ... et null quand l'entrée n'a pas d'acteur.
    const newest = rows[0];
    expect(newest.actorName).toBeNull();
    expect(newest.actorEmail).toBeNull();
  });

  it('reflète les écritures de recordAudit (via une mutation auditée)', async () => {
    const t = convexTest(schema, modules);

    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', {
        role: 'admin',
        name: 'Admin',
        email: 'admin@test.org',
      }),
    );
    const targetId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'cible@test.org' }),
    );

    // setRole appelle recordAudit(USER_ROLE_CHANGED) — peuple auditLog.
    await t
      .withIdentity({ subject: `${adminId}|s` })
      .mutation(api.users.setRole, { userId: targetId, role: 'moderateur' });

    const { page: rows } = await t
      .withIdentity({ subject: `${adminId}|s` })
      .query(api.journal.listAuditLog, PAGE);

    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe(AUDIT.USER_ROLE_CHANGED);
    expect(rows[0].targetId).toBe(targetId);
    expect(rows[0].actorName).toBe('Admin');
    expect(rows[0].actorEmail).toBe('admin@test.org');
  });

  it('respecte la taille de page demandée (entrées les plus récentes)', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'admin@test.org' }),
    );
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert('auditLog', {
          action: AUDIT.TRIBUNE_MODERATED,
          targetId: `t-${i}`,
          createdAt: i,
        });
      }
    });

    const { page: rows, isDone } = await t
      .withIdentity({ subject: `${adminId}|s` })
      .query(api.journal.listAuditLog, {
        paginationOpts: { numItems: 2, cursor: null },
      });
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.createdAt)).toEqual([4, 3]);
    expect(isDone).toBe(false);
  });

  it('réserve la lecture aux administrateurs (modérateur -> throw, admin OK)', async () => {
    const t = convexTest(schema, modules);

    // anonyme refusé
    await expect(t.query(api.journal.listAuditLog, PAGE)).rejects.toThrow();

    // modérateur refusé (données sensibles -> admin seulement)
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${modId}|s` })
        .query(api.journal.listAuditLog, PAGE),
    ).rejects.toThrow();

    // éditeur refusé
    const editorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'editeur', email: 'ed@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${editorId}|s` })
        .query(api.journal.listAuditLog, PAGE),
    ).rejects.toThrow();

    // admin autorisé
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'admin@test.org' }),
    );
    const { page: rows } = await t
      .withIdentity({ subject: `${adminId}|s` })
      .query(api.journal.listAuditLog, PAGE);
    expect(rows).toEqual([]);
  });
});

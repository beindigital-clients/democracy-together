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

describe('Back-office — RBAC des queries (F-26/F-61/F-63)', () => {
  it('dashboard+candidatures = modérateur+ ; utilisateurs = admin', async () => {
    const t = convexTest(schema, modules);
    const membreId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'membre@test.org' }),
    );
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'admin@test.org' }),
    );

    const asMembre = t.withIdentity({ subject: `${membreId}|s` });
    await expect(
      asMembre.query(api.admin.dashboardStats, {}),
    ).rejects.toThrow();
    await expect(
      asMembre.query(api.admin.listApplications, {}),
    ).rejects.toThrow();
    await expect(asMembre.query(api.admin.listUsers, {})).rejects.toThrow();

    const asMod = t.withIdentity({ subject: `${modId}|s` });
    await asMod.query(api.admin.dashboardStats, {});
    await asMod.query(api.admin.listApplications, {});
    await expect(asMod.query(api.admin.listUsers, {})).rejects.toThrow();

    const users = await t
      .withIdentity({ subject: `${adminId}|s` })
      .query(api.admin.listUsers, {});
    expect(users.length).toBe(3);
  });

  it('dashboardStats compte les candidatures en attente (F-61)', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'admin@test.org' }),
    );
    await t.mutation(internal.organizations.storeApplication, {
      type: 'organisation',
      organizationName: 'Institut A',
      contactEmail: 'a@demo.org',
      country: 'SN',
    });
    await t.mutation(internal.organizations.storeApplication, {
      type: 'individu',
      organizationName: 'Awa Diop',
      contactEmail: 'b@demo.org',
      country: 'FR',
    });

    const stats = await t
      .withIdentity({ subject: `${adminId}|s` })
      .query(api.admin.dashboardStats, {});
    expect(stats.pendingApplications).toBe(2);
    expect(stats.totalApplications).toBe(2);
    expect(stats.totalUsers).toBe(1);

    const pending = await t
      .withIdentity({ subject: `${adminId}|s` })
      .query(api.admin.listApplications, { status: 'pending' });
    expect(pending.map((a) => a.organizationName).sort()).toEqual([
      'Awa Diop',
      'Institut A',
    ]);
  });
});

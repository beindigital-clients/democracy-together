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

// AUTH_DEV_OTP n'est PAS defini dans cet environnement de test -> on verifie que
// chaque surface « dev » est FERMEE (comme elle le serait en prod).
// Un guard casse ferait echouer ce test au lieu de passer en silence.
describe('Securite — gardes des backdoors DEV sans AUTH_DEV_OTP', () => {
  it('ferme seed/otp (throw) et les oracles de lecture (null)', async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.seed.seedDirectory, {})).rejects.toThrow();
    await expect(
      t.query(internal.otp.latestDevCode, { email: 'x@y.z' }),
    ).rejects.toThrow();
    expect(
      await t.query(internal.contact.latestForEmail, { email: 'x@y.z' }),
    ).toBeNull();
    expect(
      await t.query(internal.organizations.latestApplicationForEmail, {
        email: 'x@y.z',
      }),
    ).toBeNull();
    // Les 4 oracles que l'audit signalait comme NON couverts (§ 4.2 H2).
    expect(
      await t.query(internal.newsletter.isSubscribed, { email: 'x@y.z' }),
    ).toBeNull();
    expect(
      await t.query(internal.events.isRegistered, {
        eventSlug: 'e',
        email: 'x@y.z',
      }),
    ).toBeNull();
    expect(
      await t.query(internal.youth.isYouthApplicant, { email: 'x@y.z' }),
    ).toBeNull();
    expect(
      await t.query(internal.mentorship.isMentorshipRequested, {
        email: 'x@y.z',
      }),
    ).toBeNull();
    expect(
      await t.query(internal.eventReminders.isReminderSet, {
        eventSlug: 'e',
        email: 'x@y.z',
      }),
    ).toBeNull();
  });
});

describe('Securite — setRole anti-lockout (F-63)', () => {
  it('refuse l auto-retrogradation et la perte du dernier admin', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'a@test.org' }),
    );
    const otherId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'b@test.org' }),
    );
    const asAdmin = t.withIdentity({ subject: `${adminId}|s` });

    // 1) l'admin ne peut pas se retrograder lui-meme (dernier rempart)
    await expect(
      asAdmin.mutation(api.users.setRole, { userId: adminId, role: 'membre' }),
    ).rejects.toThrow();
    expect((await t.run((ctx) => ctx.db.get(adminId)))?.role).toBe('admin');

    // 2) promouvoir un autre utilisateur reste possible
    await asAdmin.mutation(api.users.setRole, {
      userId: otherId,
      role: 'moderateur',
    });
    expect((await t.run((ctx) => ctx.db.get(otherId)))?.role).toBe('moderateur');

    // 3) avec deux admins, on peut en retrograder un (il en reste un)
    const admin2 = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'c@test.org' }),
    );
    await asAdmin.mutation(api.users.setRole, {
      userId: admin2,
      role: 'membre',
    });
    expect((await t.run((ctx) => ctx.db.get(admin2)))?.role).toBe('membre');
  });
});

describe('Annuaire — getBySlug ne renvoie que les actifs (F-21)', () => {
  it('masque une organisation pending', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('organizations', {
        name: 'Pending Org',
        slug: 'pending-org',
        country: 'SN',
        region: 'afrique-ouest',
        languages: ['fr'],
        themes: ['gouvernance'],
        status: 'pending',
        createdAt: 0,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert('organizations', {
        name: 'Active Org',
        slug: 'active-org',
        country: 'FR',
        region: 'europe-ouest',
        languages: ['fr'],
        themes: ['gouvernance'],
        status: 'active',
        createdAt: 0,
      }),
    );
    expect(
      await t.query(api.organizations.getBySlug, { slug: 'pending-org' }),
    ).toBeNull();
    expect(
      (await t.query(api.organizations.getBySlug, { slug: 'active-org' }))?.name,
    ).toBe('Active Org');
  });
});

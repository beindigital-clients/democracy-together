// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { base32Decode, hotp, timeStep, totp } from './lib/totp';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

type T = ReturnType<typeof convexTest>;
type Role = 'visiteur' | 'membre' | 'moderateur' | 'editeur' | 'admin';

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(42)));

beforeEach(() => {
  vi.stubEnv('TWO_FACTOR_ENCRYPTION_KEY', KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function createUser(t: T, email: string, role: Role) {
  return await t.run((ctx) => ctx.db.insert('users', { email, role }));
}

/** Une NOUVELLE session pour ce compte — une nouvelle connexion. */
async function newSession(t: T, userId: Id<'users'>) {
  const sessionId = await t.run((ctx) =>
    ctx.db.insert('authSessions', {
      userId,
      expirationTime: Date.now() + 3_600_000,
    }),
  );
  return t.withIdentity({ subject: `${userId}|${sessionId}` });
}

/** Inscrit un appareil ; rend le secret et les codes de secours. */
async function enroll(t: T, userId: Id<'users'>) {
  const as = await newSession(t, userId);
  const { secret, uri } = await as.action(api.twoFactor.beginEnrollment, {});
  expect(uri).toContain(`secret=${secret}`);
  const key = base32Decode(secret);
  const res = await as.action(api.twoFactor.confirmEnrollment, {
    code: await totp(key, Date.now()),
  });
  if (!res.ok) throw new Error(res.reason);
  return { as, key, backupCodes: res.backupCodes };
}

describe('2FA — inscription', () => {
  it('ne s’active qu’après un premier code juste, et chiffre le secret au repos', async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t, 'm@test.org', 'membre');
    const as = await newSession(t, userId);

    const { secret } = await as.action(api.twoFactor.beginEnrollment, {});
    expect((await as.query(api.twoFactor.status, {})).pending).toBe(true);
    // En attente : ne bloque personne.
    expect(await as.query(api.users.current, {})).not.toBeNull();

    const bad = await as.action(api.twoFactor.confirmEnrollment, {
      code: '000000',
    });
    // (1 chance sur un million que 000000 soit juste.)
    expect(bad.ok).toBe(false);

    const res = await as.action(api.twoFactor.confirmEnrollment, {
      code: await totp(base32Decode(secret), Date.now()),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.backupCodes).toHaveLength(10);

    const row = await t.run((ctx) =>
      ctx.db
        .query('twoFactorCredentials')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .unique(),
    );
    expect(row?.status).toBe('active');
    expect(row?.keyId).toBe('env');
    // Le secret n'est jamais en clair, les codes de secours sont hachés.
    expect(JSON.stringify(row)).not.toContain(secret);
    if (res.ok) {
      for (const code of res.backupCodes) {
        expect(JSON.stringify(row)).not.toContain(code.replace('-', ''));
      }
    }
    // La session qui vient de s'inscrire garde l'accès.
    expect(await as.query(api.users.current, {})).not.toBeNull();
  });

  it('refuse l’inscription sans clé de chiffrement hors développement', async () => {
    vi.stubEnv('TWO_FACTOR_ENCRYPTION_KEY', '');
    vi.stubEnv('AUTH_DEV_OTP', '');
    const t = convexTest(schema, modules);
    const userId = await createUser(t, 'm@test.org', 'membre');
    const as = await newSession(t, userId);
    await expect(as.action(api.twoFactor.beginEnrollment, {})).rejects.toThrow(
      'TWO_FACTOR_KEY_NOT_CONFIGURED',
    );
  });
});

describe('2FA — preuve liée à la session', () => {
  it('une nouvelle session sans preuve est refusée partout, jusqu’au code', async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t, 'mod@test.org', 'moderateur');
    const { key } = await enroll(t, userId);

    const fresh = await newSession(t, userId);
    expect(await fresh.query(api.accounts.sessionState, {})).toEqual({
      state: 'second_factor_required',
    });
    expect(await fresh.query(api.users.current, {})).toBeNull();
    await expect(
      fresh.mutation(api.users.setPreferredLocale, { locale: 'en' }),
    ).rejects.toThrow('TWO_FACTOR_REQUIRED');
    await expect(fresh.query(api.admin.dashboardStats, {})).rejects.toThrow(
      'TWO_FACTOR_REQUIRED',
    );

    // Le pas suivant : l'inscription a consommé le pas courant.
    const next = await hotp(key, timeStep(Date.now()) + 1);
    expect(await fresh.action(api.twoFactor.verify, { code: next })).toEqual({
      ok: true,
    });
    expect(await fresh.query(api.users.current, {})).not.toBeNull();
    await fresh.query(api.admin.dashboardStats, {});

    // Une AUTRE session du même compte n'hérite pas de la preuve.
    const other = await newSession(t, userId);
    expect(await other.query(api.users.current, {})).toBeNull();
  });

  it('refuse un code rejoué dans sa fenêtre de validité', async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t, 'm@test.org', 'membre');
    const { key } = await enroll(t, userId);
    const code = await hotp(key, timeStep(Date.now()) + 1);

    const s1 = await newSession(t, userId);
    expect(await s1.action(api.twoFactor.verify, { code })).toEqual({
      ok: true,
    });
    // Même code, autre session, toujours dans la fenêtre de ±30 s.
    const s2 = await newSession(t, userId);
    expect(await s2.action(api.twoFactor.verify, { code })).toEqual({
      ok: false,
      reason: 'REPLAYED',
    });
    expect(await s2.query(api.users.current, {})).toBeNull();
  });

  it('un code de secours ne sert qu’une fois', async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t, 'm@test.org', 'membre');
    const { backupCodes } = await enroll(t, userId);
    const [first] = backupCodes;

    const s1 = await newSession(t, userId);
    // Saisi en minuscules, sans tiret : la forme est normalisée.
    expect(
      await s1.action(api.twoFactor.verify, {
        code: first.replace('-', '').toLowerCase(),
      }),
    ).toEqual({ ok: true });

    const s2 = await newSession(t, userId);
    expect(await s2.action(api.twoFactor.verify, { code: first })).toEqual({
      ok: false,
      reason: 'INVALID_CODE',
    });
    expect(
      (await s1.query(api.twoFactor.status, {})).backupCodesRemaining,
    ).toBe(9);
  });

  it('plafonne les essais', async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t, 'm@test.org', 'membre');
    await enroll(t, userId);
    const s = await newSession(t, userId);
    // L'inscription a consommé un essai (confirmation) sur six.
    for (let i = 0; i < 5; i++) {
      await s.action(api.twoFactor.verify, { code: 'AAAAA-AAAAA' });
    }
    await expect(
      s.action(api.twoFactor.verify, { code: 'AAAAA-AAAAA' }),
    ).rejects.toThrow('RATE_LIMITED');
  });
});

describe('2FA — obligation pour l’encadrement (réglage en base)', () => {
  it('désactivée par défaut ; activée, elle bloque un modérateur sans appareil', async () => {
    const t = convexTest(schema, modules);
    const adminId = await createUser(t, 'admin@test.org', 'admin');
    const modId = await createUser(t, 'mod@test.org', 'moderateur');
    const memberId = await createUser(t, 'm@test.org', 'membre');
    const mod = await newSession(t, modId);
    const member = await newSession(t, memberId);

    const admin0 = await newSession(t, adminId);
    expect(await admin0.query(api.twoFactor.securityPolicy, {})).toMatchObject({
      twoFactorRequiredForStaff: false,
      keyStatus: 'configured',
    });
    // Garde-fou : l'administrateur doit d'abord avoir SA 2FA.
    await expect(
      admin0.mutation(api.twoFactor.setSecurityPolicy, {
        twoFactorRequiredForStaff: true,
      }),
    ).rejects.toThrow('ENROLL_FIRST');

    const { as: admin } = await enroll(t, adminId);
    await admin.mutation(api.twoFactor.setSecurityPolicy, {
      twoFactorRequiredForStaff: true,
    });

    expect(await mod.query(api.accounts.sessionState, {})).toEqual({
      state: 'enrollment_required',
    });
    await expect(mod.query(api.admin.dashboardStats, {})).rejects.toThrow(
      'TWO_FACTOR_ENROLLMENT_REQUIRED',
    );
    // Un simple membre n'est pas concerné.
    expect(await member.query(api.users.current, {})).not.toBeNull();
    // Le modérateur peut s'inscrire (les écrans de 2FA restent ouverts)…
    expect((await mod.query(api.twoFactor.status, {})).required).toBe(true);
    const { as: modEnrolled, key: modKey } = await enroll(t, modId);
    expect(await modEnrolled.query(api.users.current, {})).not.toBeNull();
    // … et, inscrit, ne peut plus retirer sa 2FA tant que le réglage tient.
    await expect(
      modEnrolled.action(api.twoFactor.disable, {
        code: await hotp(modKey, timeStep(Date.now()) + 1),
      }),
    ).rejects.toThrow('TWO_FACTOR_REQUIRED_BY_POLICY');
    const audit = await t.run((ctx) =>
      ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) =>
          q.eq('action', 'security.policy_changed'),
        )
        .collect(),
    );
    expect(audit).toHaveLength(1);
  });

  it('refuse un non-administrateur', async () => {
    const t = convexTest(schema, modules);
    const modId = await createUser(t, 'mod@test.org', 'moderateur');
    const mod = await newSession(t, modId);
    await expect(
      mod.mutation(api.twoFactor.setSecurityPolicy, {
        twoFactorRequiredForStaff: false,
      }),
    ).rejects.toThrow(/Accès refusé/);
  });
});

describe('2FA — réinitialisation par un administrateur', () => {
  it('retire l’appareil, ferme les preuves, et se journalise avec son motif', async () => {
    const t = convexTest(schema, modules);
    const adminId = await createUser(t, 'admin@test.org', 'admin');
    const userId = await createUser(t, 'm@test.org', 'membre');
    await enroll(t, userId);
    const admin = await newSession(t, adminId);

    await expect(
      admin.mutation(api.twoFactor.resetForUser, { userId, reason: '' }),
    ).rejects.toThrow('INVALID_REASON');
    await admin.mutation(api.twoFactor.resetForUser, {
      userId,
      reason: 'Téléphone perdu, identité vérifiée par le secrétariat',
    });

    const fresh = await newSession(t, userId);
    expect(await fresh.query(api.users.current, {})).not.toBeNull();
    const audit = await t.run((ctx) =>
      ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) => q.eq('action', 'twoFactor.reset'))
        .collect(),
    );
    expect(audit[0]).toMatchObject({
      actorId: adminId,
      targetId: userId,
      metadata: {
        reason: 'Téléphone perdu, identité vérifiée par le secrétariat',
      },
    });
  });

  it('dernier recours d’exploitation : réinitialisation par la CLI, journalisée', async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t, 'seul-admin@test.org', 'admin');
    await enroll(t, userId);
    expect(
      await t.mutation(internal.twoFactor.resetByOperator, {
        email: 'Seul-Admin@test.org',
        reason: 'Appareil et codes perdus, identité vérifiée par le bureau',
      }),
    ).toEqual({ reset: true });
    const fresh = await newSession(t, userId);
    expect(await fresh.query(api.users.current, {})).not.toBeNull();
    const audit = await t.run((ctx) =>
      ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) => q.eq('action', 'twoFactor.reset'))
        .collect(),
    );
    expect(audit[0]?.metadata).toMatchObject({ via: 'cli' });
  });

  it('la désactivation par le titulaire exige un code valide', async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t, 'm@test.org', 'membre');
    const { as, key } = await enroll(t, userId);
    expect(
      await as.action(api.twoFactor.disable, { code: 'ZZZZZ-ZZZZZ' }),
    ).toEqual({ ok: false, reason: 'INVALID_CODE' });
    expect(
      await as.action(api.twoFactor.disable, {
        code: await hotp(key, timeStep(Date.now()) + 1),
      }),
    ).toEqual({ ok: true });
    expect((await as.query(api.twoFactor.status, {})).enabled).toBe(false);
  });
});

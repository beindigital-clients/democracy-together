// @vitest-environment edge-runtime
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { internal } from './_generated/api';
import { bootstrapAdmin } from './bootstrap';
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

const ADMIN_EMAIL = 'fondateur@dt.test';

// Bootstrapping (issue #47) is the ONLY production path to the first
// administrator. Its two guards are tested here because a regression in
// either would not show otherwise: without the "zero admins" guard, the
// mutation would remain replayable forever on a live deployment — a
// backdoor; without the BOOTSTRAP_ADMIN_EMAIL guard, it would promote any
// address.
//
// Convention of this file: we start from an environment where NEITHER
// BOOTSTRAP_ADMIN_EMAIL NOR AUTH_DEV_OTP is defined — the state of a production
// deployment — and each test sets only what it needs.
const ENV_KEYS = ['BOOTSTRAP_ADMIN_EMAIL', 'AUTH_DEV_OTP'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("Amorçage de l'administrateur initial (#47)", () => {
  it('déploiement neuf : crée le compte, accorde « admin », audite', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = ADMIN_EMAIL;
    const t = convexTest(schema, modules);

    // Arbitrary case and spaces: the address is normalized as at
    // sign-in, otherwise the created account would never be found by
    // `createOrUpdateUser` (convex/auth.ts).
    const res = await t.mutation(internal.bootstrap.bootstrapAdmin, {
      email: '  Fondateur@DT.TEST  ',
    });
    expect(res.ok).toBe(true);
    expect(res.created).toBe(true);
    expect(res.email).toBe(ADMIN_EMAIL);

    const user = await t.run((ctx) => ctx.db.get(res.userId));
    expect(user?.role).toBe('admin');
    expect(user?.email).toBe(ADMIN_EMAIL);

    // Audit (F-67): the operation leaves a trace, with no actor — it comes from
    // the operations CLI, not from a platform account.
    const entries = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe(AUDIT.ADMIN_BOOTSTRAPPED);
    expect(entries[0].targetId).toBe(res.userId);
    expect(entries[0].actorId).toBeUndefined();
    expect(entries[0].metadata).toMatchObject({
      email: ADMIN_EMAIL,
      role: 'admin',
      created: true,
      via: 'bootstrap',
    });
  });

  it('compte déjà ouvert (invitation) : promeut sans dupliquer la ligne', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = ADMIN_EMAIL;
    const t = convexTest(schema, modules);
    const existingId = await t.run((ctx) =>
      ctx.db.insert('users', { email: ADMIN_EMAIL, role: 'visiteur' }),
    );

    const res = await t.mutation(internal.bootstrap.bootstrapAdmin, {
      email: ADMIN_EMAIL,
    });
    expect(res.created).toBe(false);
    expect(res.userId).toBe(existingId);

    const rows = await t.run((ctx) => ctx.db.query('users').collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('admin');
  });

  it('un administrateur existe déjà : rejet (la mutation n’est pas rejouable)', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = ADMIN_EMAIL;
    const t = convexTest(schema, modules);

    await t.mutation(internal.bootstrap.bootstrapAdmin, { email: ADMIN_EMAIL });

    // Second call, variable still in place: the "zero admins" guard is enough
    // to close the door. This is what prevents bootstrapping from being a permanent
    // backdoor when the variable is forgotten on the deployment.
    await expect(
      t.mutation(internal.bootstrap.bootstrapAdmin, { email: ADMIN_EMAIL }),
    ).rejects.toThrow(/BOOTSTRAP_ALREADY_DONE/);

    // Nothing has moved: a single account, a single audit record.
    expect(await t.run((ctx) => ctx.db.query('users').collect())).toHaveLength(
      1,
    );
    expect(
      await t.run((ctx) => ctx.db.query('auditLog').collect()),
    ).toHaveLength(1);
  });

  it('un administrateur venu d’ailleurs ferme aussi l’amorçage', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = ADMIN_EMAIL;
    const t = convexTest(schema, modules);
    // Existing admin with a DIFFERENT address: the guard is about the presence
    // of an administrator, not that of the bootstrapped address — otherwise the
    // mutation would remain a way to add oneself to the existing administrators.
    await t.run((ctx) =>
      ctx.db.insert('users', { email: 'deja@dt.test', role: 'admin' }),
    );

    await expect(
      t.mutation(internal.bootstrap.bootstrapAdmin, { email: ADMIN_EMAIL }),
    ).rejects.toThrow(/BOOTSTRAP_ALREADY_DONE/);

    const rows = await t.run((ctx) => ctx.db.query('users').collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('deja@dt.test');
    expect(
      await t.run((ctx) => ctx.db.query('auditLog').collect()),
    ).toHaveLength(0);
  });

  it('sans BOOTSTRAP_ADMIN_EMAIL : rejet, aucun compte créé', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.bootstrap.bootstrapAdmin, { email: ADMIN_EMAIL }),
    ).rejects.toThrow(/BOOTSTRAP_ADMIN_NOT_CONFIGURED/);
    expect(await t.run((ctx) => ctx.db.query('users').collect())).toHaveLength(
      0,
    );
  });

  it('adresse différente de BOOTSTRAP_ADMIN_EMAIL : rejet', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = ADMIN_EMAIL;
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.bootstrap.bootstrapAdmin, {
        email: 'pirate@dt.test',
      }),
    ).rejects.toThrow(/BOOTSTRAP_EMAIL_MISMATCH/);
    expect(await t.run((ctx) => ctx.db.query('users').collect())).toHaveLength(
      0,
    );
  });

  it('adresse invalide : rejet', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'pas-une-adresse';
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.bootstrap.bootstrapAdmin, {
        email: 'pas-une-adresse',
      }),
    ).rejects.toThrow(/INVALID_EMAIL/);
  });

  // Regression reported by the issue: bootstrapping must be TOTALLY
  // independent of the development surface. AUTH_DEV_OTP is not an
  // isolated flag — when it is set, every sign-in code issued is written
  // in plaintext to `devOtpCodes` and read back by an oracle. Bootstrapping an admin must
  // therefore neither require that flag nor write to that table.
  it('n’exige pas AUTH_DEV_OTP et n’écrit rien dans devOtpCodes', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = ADMIN_EMAIL;
    // State of a production deployment: the dev flag is absent.
    expect(process.env.AUTH_DEV_OTP).toBeUndefined();
    const t = convexTest(schema, modules);

    const res = await t.mutation(internal.bootstrap.bootstrapAdmin, {
      email: ADMIN_EMAIL,
    });
    expect((await t.run((ctx) => ctx.db.get(res.userId)))?.role).toBe('admin');

    expect(
      await t.run((ctx) => ctx.db.query('devOtpCodes').collect()),
    ).toHaveLength(0);

    // Counter-check: the other role-assignment path stays closed
    // without the flag. It is indeed bootstrapping that changed, not the dev guard.
    await expect(
      t.mutation(internal.devAdmin.setRoleByEmail, {
        email: 'autre@dt.test',
        role: 'admin',
      }),
    ).rejects.toThrow(/AUTH_DEV_OTP/);
  });

  // If `internalMutation` became `mutation`, bootstrapping would move into the
  // public API: callable by any client during the window when the
  // deployment is new. Both guards would hold, but the surface has
  // no reason to exist — this test locks it down.
  it('reste hors API publique (internalMutation)', () => {
    const registered = bootstrapAdmin as unknown as {
      isMutation?: boolean;
      isInternal?: boolean;
      isPublic?: boolean;
    };
    expect(registered.isMutation).toBe(true);
    expect(registered.isInternal).toBe(true);
    expect(registered.isPublic).toBeUndefined();
  });
});

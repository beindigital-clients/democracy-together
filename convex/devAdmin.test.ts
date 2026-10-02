// @vitest-environment edge-runtime
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import { internal } from './_generated/api';
import {
  setRoleByEmail,
  clearRoleByEmail,
  purgeUserByEmail,
  deleteTestPublications,
  enrichPublication,
} from './devAdmin';
import { COUNTER, readCounter } from './lib/counters';
import { ROLE_ORDER } from './lib/roles';
import { resolveSignInUserId } from './lib/signIn';

// `devAdmin.ts` was covered by NO test (issue #42), even though PR #4
// changed the very nature of `setRoleByEmail`: from `patch` to UPSERT.
//
// Why this change: closing self-signup removed the
// last path that CREATED an account. `setRoleByEmail` — the only
// documented way to bootstrap an administrator on a dev deployment, and the
// fixture for all E2E sessions — therefore systematically failed with
// "Utilisateur introuvable": a new deployment no longer had any account to
// promote. It is the CREATION CASE that unblocks everything, and it is precisely
// the one nothing checked.
//
// Mind the scope: this helper is NOT the production procedure.
// Bootstrapping in service goes through `bootstrap:bootstrapAdmin` and its dedicated
// variable (TESTING.md, docs/deploiement.md § 5); its tests live in
// convex/bootstrap.test.ts and are not repeated here.

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Convention from bootstrap.test.ts / otp.test.ts: we start from the state of a
// PRODUCTION deployment, flag absent, and each test sets what it
// needs. Here almost all need it — the guard is the subject of only one.
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.AUTH_DEV_OTP;
  delete process.env.AUTH_DEV_OTP;
});

afterEach(() => {
  if (saved === undefined) delete process.env.AUTH_DEV_OTP;
  else process.env.AUTH_DEV_OTP = saved;
});

const ADMIN = 'fondateur@dt.test';

const utilisateurs = (t: TestConvex<typeof schema>) =>
  t.run((ctx) => ctx.db.query('users').collect());

describe('setRoleByEmail — le cas de CRÉATION (PR #4)', () => {
  beforeEach(() => {
    process.env.AUTH_DEV_OTP = 'true';
  });

  it('crée le compte quand l’e-mail est inconnu, au lieu d’échouer', async () => {
    const t = convexTest(schema, modules);
    // Fresh database: this is the state of a freshly created dev deployment, and
    // that of a CI preview. Before the upsert, the call threw here.
    expect(await utilisateurs(t)).toHaveLength(0);

    const res = await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: ADMIN,
      role: 'admin',
    });

    expect(res).toMatchObject({ ok: true, role: 'admin', created: true });
    expect(await t.run((ctx) => ctx.db.get(res.userId))).toMatchObject({
      email: ADMIN,
      role: 'admin',
    });
  });

  it('met à jour le compte existant sans en créer un second', async () => {
    const t = convexTest(schema, modules);
    const existant = await t.run((ctx) =>
      ctx.db.insert('users', { email: ADMIN, role: 'membre' }),
    );

    const res = await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: ADMIN,
      role: 'admin',
    });

    expect(res).toMatchObject({ created: false, userId: existant });
    expect(await utilisateurs(t)).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(existant))).toMatchObject({
      role: 'admin',
    });
  });

  // The `users` counter feeds the back-office dashboard. It is
  // incremented IN the transaction that creates — so it must be incremented once at
  // creation, and NEVER on an update: `setRoleByEmail` is replayed on
  // every E2E run (the helpers are idempotent), and one increment per
  // pass would make the screen drift a little more on each run.
  it('compte la création une seule fois, et ne compte pas les mises à jour', async () => {
    const t = convexTest(schema, modules);
    const compteur = () => t.run((ctx) => readCounter(ctx, COUNTER.USERS));

    await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: ADMIN,
      role: 'admin',
    });
    expect(await compteur()).toBe(1);

    for (const role of ['membre', 'editeur', 'admin'] as const) {
      await t.mutation(internal.devAdmin.setRoleByEmail, {
        email: ADMIN,
        role,
      });
    }
    expect(await compteur()).toBe(1);
    expect(await utilisateurs(t)).toHaveLength(1);
  });

  it.each(ROLE_ORDER)(
    'sait amorcer un compte avec le rôle « %s »',
    async (role) => {
      const t = convexTest(schema, modules);
      const res = await t.mutation(internal.devAdmin.setRoleByEmail, {
        email: ADMIN,
        role,
      });
      expect(res).toMatchObject({ created: true, role });
    },
  );
});

describe('setRoleByEmail — normalisation de l’adresse', () => {
  beforeEach(() => {
    process.env.AUTH_DEV_OTP = 'true';
  });

  it('enregistre l’adresse en minuscules et sans espaces', async () => {
    const t = convexTest(schema, modules);
    const res = await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: '  Fondateur@DT.TEST  ',
      role: 'admin',
    });
    expect(await t.run((ctx) => ctx.db.get(res.userId))).toMatchObject({
      email: ADMIN,
    });
  });

  // WHAT IS AT STAKE in this normalization, and the reason it deserves a
  // test of its own: the sign-in decision (convex/lib/signIn.ts, called by
  // the createOrUpdateUser callback) does an EXACT equality on the address. An
  // account bootstrapped under "Fondateur@DT.TEST" would NEVER be found — an
  // administrator created, visible in the database, and unable to sign in.
  it('le compte amorcé est retrouvé par la décision de connexion', async () => {
    const t = convexTest(schema, modules);
    const res = await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: '  Fondateur@DT.TEST  ',
      role: 'admin',
    });

    // The address as Convex Auth will present it to the callback: normalized.
    expect(await t.run((ctx) => resolveSignInUserId(ctx.db, ADMIN))).toBe(
      res.userId,
    );
  });

  it('deux casses différentes désignent le même compte (helper idempotent)', async () => {
    const t = convexTest(schema, modules);
    const a = await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: 'Fondateur@DT.test',
      role: 'membre',
    });
    const b = await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: 'FONDATEUR@dt.TEST',
      role: 'admin',
    });

    expect(b.userId).toBe(a.userId);
    expect(b.created).toBe(false);
    expect(await utilisateurs(t)).toHaveLength(1);
    expect(await t.run((ctx) => readCounter(ctx, COUNTER.USERS))).toBe(1);
  });
});

describe('clearRoleByEmail — reproduire un compte hérité', () => {
  beforeEach(() => {
    process.env.AUTH_DEV_OTP = 'true';
  });

  it('RETIRE la colonne `role` au lieu de l’écrire à null', async () => {
    const t = convexTest(schema, modules);
    const { userId } = await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: ADMIN,
      role: 'admin',
    });

    await t.mutation(internal.devAdmin.clearRoleByEmail, { email: ADMIN });

    const ligne = await t.run((ctx) => ctx.db.get(userId));
    // The nuance is the whole helper: the row must become EXACTLY that
    // of an account from before PR #4 again — field absent. A `role: null` would be a
    // third state, which the schema validator refuses and which the back office
    // never had to display.
    expect(ligne).not.toBeNull();
    // `Object.keys` rather than `Object.hasOwn`: the lib declared by
    // convex/tsconfig.json stops at ES2021. And the failure message is more
    // telling — it lists the columns actually present.
    expect(Object.keys(ligne!)).not.toContain('role');
    expect(ligne?.role).toBeUndefined();
  });

  it('échoue sur un compte inconnu (elle ne crée rien, contrairement à l’upsert)', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.devAdmin.clearRoleByEmail, { email: ADMIN }),
    ).rejects.toThrow(/introuvable/i);
    expect(await utilisateurs(t)).toHaveLength(0);
  });
});

describe('purgeUserByEmail — le compteur revient à son point de départ', () => {
  beforeEach(() => {
    process.env.AUTH_DEV_OTP = 'true';
  });

  it('défait exactement ce que la création avait compté', async () => {
    // Without this symmetry, each "bootstrap then purge" cycle of an E2E suite
    // would leave the `users` counter one notch higher, permanently.
    const t = convexTest(schema, modules);
    await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: ADMIN,
      role: 'admin',
    });

    expect(
      await t.mutation(internal.devAdmin.purgeUserByEmail, { email: ADMIN }),
    ).toMatchObject({ deleted: true });

    expect(await utilisateurs(t)).toHaveLength(0);
    expect(await t.run((ctx) => readCounter(ctx, COUNTER.USERS))).toBe(0);
  });

  it('sur une adresse inconnue : ne détruit rien et ne décrémente rien', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: ADMIN,
      role: 'admin',
    });

    expect(
      await t.mutation(internal.devAdmin.purgeUserByEmail, {
        email: 'jamais-vu@dt.test',
      }),
    ).toMatchObject({ deleted: false });

    expect(await utilisateurs(t)).toHaveLength(1);
    expect(await t.run((ctx) => readCounter(ctx, COUNTER.USERS))).toBe(1);
  });
});

// --- The development surface stays closed ------------------------------------
//
// These five mutations promote an account to administrator rank, purge a
// user, delete publications. Two locks hold them, and
// neither was checked: the AUTH_DEV_OTP guard, and the fact that they
// are INTERNAL — hence unreachable by a client, whatever the value
// of the flag. Same reasoning as convex/dev-oracles.test.ts for the
// read oracles, applied here to the mutations that WRITE.

const MUTATIONS = [
  ['setRoleByEmail', setRoleByEmail, { email: ADMIN, role: 'admin' }],
  ['clearRoleByEmail', clearRoleByEmail, { email: ADMIN }],
  ['purgeUserByEmail', purgeUserByEmail, { email: ADMIN }],
  ['deleteTestPublications', deleteTestPublications, { marker: 'MARQUEUR' }],
  ['enrichPublication', enrichPublication, { marker: 'MARQUEUR' }],
] as const;

describe('devAdmin — surface DEV/TEST verrouillée', () => {
  it.each(MUTATIONS)('%s exige AUTH_DEV_OTP', async (nom, _fn, args) => {
    expect(process.env.AUTH_DEV_OTP).toBeUndefined();
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(
        internal.devAdmin[nom],
        args as { email: string; role: 'admin' } & { marker: string },
      ),
    ).rejects.toThrow(/AUTH_DEV_OTP/);
  });

  it.each(MUTATIONS)(
    '%s reste hors API publique (internalMutation)',
    (_nom, fn) => {
      const enregistree = fn as unknown as {
        isMutation?: boolean;
        isInternal?: boolean;
        isPublic?: boolean;
      };
      expect(enregistree.isMutation).toBe(true);
      expect(enregistree.isInternal).toBe(true);
      expect(enregistree.isPublic).toBeUndefined();
    },
  );

  it('l’amorçage ne laisse aucun code de connexion en clair', async () => {
    // `setRoleByEmail` is guarded by AUTH_DEV_OTP, the flag that enables
    // writing OTP codes in plaintext. It must not write any for all that:
    // promoting an account issues no code.
    process.env.AUTH_DEV_OTP = 'true';
    const t = convexTest(schema, modules);
    await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: ADMIN,
      role: 'admin',
    });
    expect(
      await t.run((ctx) => ctx.db.query('devOtpCodes').collect()),
    ).toHaveLength(0);
  });
});

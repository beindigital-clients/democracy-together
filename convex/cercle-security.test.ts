// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { evaluateAccess } from './lib/accountAccess';

// CERCLE DES AMIS — ACCOUNT SECURITY (feature 7).
//
// 1. Suspension cuts an Ami off AT ONCE: sessions deleted, every Cercle door
//    refused, the Cercle's news no longer sent to them; reactivation restores.
// 2. The second factor: what applies to an Ami today, and what the study
//    recommends (docs/cercle-amis.md § 7).

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

type T = TestConvex<typeof schema>;

beforeEach(() => {
  vi.stubEnv(
    'TWO_FACTOR_ENCRYPTION_KEY',
    btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function account(
  t: T,
  email: string,
  over: Record<string, unknown> = {},
) {
  return await t.run((ctx) =>
    ctx.db.insert('users', { email, role: 'visiteur', ...over }),
  );
}

async function session(t: T, userId: Id<'users'>) {
  const sessionId = await t.run((ctx) =>
    ctx.db.insert('authSessions', {
      userId,
      expirationTime: Date.now() + 3_600_000,
    }),
  );
  return {
    sessionId,
    as: t.withIdentity({ subject: `${userId}|${sessionId}` }),
  };
}

const PAGE = { paginationOpts: { numItems: 10, cursor: null } };

describe('Cercle security — suspension is immediate', () => {
  it('cuts an Ami off from every Cercle door, deletes their sessions, and reactivation restores them', async () => {
    const t = convexTest(schema, modules);
    const admin = await account(t, 'admin@example.test', { role: 'admin' });
    const ami = await account(t, 'ami@example.test', { amiSince: Date.now() });
    const { sessionId, as: amiAs } = await session(t, ami);
    const adminAs = t.withIdentity({ subject: `${admin}|s` });

    await amiAs.mutation(api.cercleContributions.submit, {
      body: 'Ma contribution fictive.',
    });
    expect(
      (await amiAs.query(api.cercleContributions.list, PAGE)).page,
    ).toHaveLength(1);
    expect(await amiAs.query(api.cercle.access, {})).toEqual({ level: 'ami' });

    const res = await adminAs.mutation(api.accounts.suspendAccount, {
      userId: ami,
      reason: 'Test de suspension',
    });
    expect(res.sessionsRevoked).toBeGreaterThanOrEqual(1);
    // The session is gone…
    expect(await t.run((ctx) => ctx.db.get(sessionId))).toBeNull();
    // …and even a token still in hand opens nothing (guards read the suspension).
    for (const call of [
      () => amiAs.query(api.cercleContributions.list, PAGE),
      () =>
        amiAs.mutation(api.cercleContributions.submit, {
          body: 'Après suspension.',
        }),
    ]) {
      await expect(call()).rejects.toThrow(/ACCOUNT_SUSPENDED/);
    }
    expect(await amiAs.query(api.cercle.access, {})).toEqual({ level: 'none' });
    expect(await amiAs.query(api.users.current, {})).toBeNull();

    // Their earlier contribution stays for the others to read.
    const other = await account(t, 'other@example.test', {
      amiSince: Date.now(),
    });
    const otherAs = t.withIdentity({ subject: `${other}|s` });
    expect(
      (await otherAs.query(api.cercleContributions.list, PAGE)).page,
    ).toHaveLength(1);

    await adminAs.mutation(api.accounts.reactivateAccount, { userId: ami });
    const back = (await session(t, ami)).as;
    expect(await back.query(api.cercle.access, {})).toEqual({ level: 'ami' });
    await back.mutation(api.cercleContributions.submit, {
      body: 'De retour parmi vous.',
    });
  });

  it('withdrawing the Ami status needs no suspension and is just as immediate', async () => {
    const t = convexTest(schema, modules);
    const admin = await account(t, 'admin@example.test', { role: 'admin' });
    const ami = await account(t, 'ami@example.test', { amiSince: Date.now() });
    const amiAs = (await session(t, ami)).as;
    await t
      .withIdentity({ subject: `${admin}|s` })
      .mutation(api.users.setAmi, { userId: ami, value: false });
    await expect(
      amiAs.query(api.cercleContributions.list, PAGE),
    ).rejects.toThrow(/CERCLE_ACCESS_REQUIRED/);
  });

  it('a suspended Ami no longer receives the Cercle’s news; reactivation puts them back', async () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    vi.stubEnv('AUTH_RESEND_KEY', 're_test');
    vi.stubEnv('AUTH_EMAIL_PROVIDER', 'resend');
    vi.stubEnv('SITE_URL', 'https://dt.test');
    vi.stubEnv('CERCLE_SENDER_NAME', 'Association Fictive');
    vi.stubEnv('CERCLE_SENDER_ADDRESS', '1 rue Imaginaire');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: { body: string }) => {
        const emails = JSON.parse(init.body) as { to: string[] }[];
        sent.push(...emails.flatMap((e) => e.to));
        return new Response(
          JSON.stringify({ data: emails.map(() => ({ id: 'x' })) }),
          { status: 200 },
        );
      }),
    );
    const t = convexTest(schema, modules);
    const admin = await account(t, 'admin@dt.test', { role: 'admin' });
    const editor = await account(t, 'ed@dt.test', { role: 'editeur' });
    const ok = await account(t, 'ok@dt.test', { amiSince: 1 });
    const bad = await account(t, 'bad@dt.test', { amiSince: 1 });
    await t.run(async (ctx) => {
      for (const [email, tok] of [
        ['ok@dt.test', 'a'],
        ['bad@dt.test', 'b'],
      ] as const) {
        await ctx.db.insert('cercleContacts', {
          email,
          status: 'confirmed',
          source: 'request',
          unsubToken: tok.repeat(32),
          confirmSends: 0,
          createdAt: 0,
        });
      }
    });
    void ok;
    const adminAs = t.withIdentity({ subject: `${admin}|s` });
    await adminAs.mutation(api.accounts.suspendAccount, {
      userId: bad,
      reason: 'Abus constaté',
    });

    const ed = t.withIdentity({ subject: `${editor}|s` });
    const send = async (subject: string) => {
      const id = await ed.mutation(api.newsletter.createCampaign, {
        subject,
        body: 'Quelques nouvelles.',
        audience: 'cercle',
      });
      await t.run((ctx) => ctx.db.patch(id, { lastTestAt: Date.now() + 1 }));
      await ed.mutation(api.newsletter.sendCampaign, { campaignId: id });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      return id;
    };
    const first = await send('Première lettre');
    expect(sent).toEqual(['ok@dt.test']);
    expect(await t.run((ctx) => ctx.db.get(first))).toMatchObject({
      recipientCount: 1,
      skippedCount: 1,
    });

    sent.length = 0;
    await adminAs.mutation(api.accounts.reactivateAccount, { userId: bad });
    await send('Seconde lettre');
    expect(sent.sort()).toEqual(['bad@dt.test', 'ok@dt.test']);
  });
});

describe('Cercle security — the second factor', () => {
  it('the staff requirement does not reach an Ami (nor a member): only the staff ranks', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('securitySettings', {
        key: 'default',
        twoFactorRequiredForStaff: true,
        updatedAt: 1,
      }),
    );
    const state = async (over: Record<string, unknown>) => {
      const id = await account(t, `u${Math.random()}@example.test`, over);
      return await t.run(async (ctx) =>
        evaluateAccess(ctx, (await ctx.db.get(id))!, null),
      );
    };
    expect(await state({ role: 'moderateur' })).toBe('enrollment_required');
    expect(await state({ role: 'admin' })).toBe('enrollment_required');
    expect(await state({ role: 'visiteur', amiSince: 1 })).toBe('active');
    expect(await state({ role: 'membre' })).toBe('active');
  });

  it('an Ami who chooses a second factor is held to it: a session without the code opens nothing', async () => {
    const t = convexTest(schema, modules);
    const ami = await account(t, 'ami@example.test', { amiSince: Date.now() });
    const first = await session(t, ami);

    // Enrolls through the real flow (the screen every account has).
    const { secret } = await first.as.action(api.twoFactor.beginEnrollment, {});
    const { base32Decode, totp } = await import('./lib/totp');
    const done = await first.as.action(api.twoFactor.confirmEnrollment, {
      code: await totp(base32Decode(secret), Date.now()),
    });
    expect(done.ok).toBe(true);
    // The session that enrolled carries the proof…
    expect(await first.as.query(api.cercle.access, {})).toEqual({
      level: 'ami',
    });

    // …a NEW sign-in does not, until the code is presented.
    const second = await session(t, ami);
    await expect(
      second.as.query(api.cercleContributions.list, PAGE),
    ).rejects.toThrow(/TWO_FACTOR_REQUIRED/);
    expect(await second.as.query(api.cercle.access, {})).toEqual({
      level: 'none',
    });
  });

  it('the CV door is reserved to administrators, whom the staff requirement DOES cover', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('securitySettings', {
        key: 'default',
        twoFactorRequiredForStaff: true,
        updatedAt: 1,
      }),
    );
    const admin = await account(t, 'admin@example.test', { role: 'admin' });
    const adminAs = (await session(t, admin)).as;
    // An administrator who has not enrolled a device is stopped before any
    // personal data: neither the list of requests nor a CV opens.
    await expect(
      adminAs.query(api.cercle.listRequests, { status: 'pending', ...PAGE }),
    ).rejects.toThrow(/TWO_FACTOR_ENROLLMENT_REQUIRED/);
    await expect(
      adminAs.mutation(api.cercleMailing.importContacts, {
        csv: 'a@resend.dev',
        batch: 'x',
      }),
    ).rejects.toThrow(/TWO_FACTOR_ENROLLMENT_REQUIRED/);
  });
});

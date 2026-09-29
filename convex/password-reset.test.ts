// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import { MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR } from './lib/passwordPolicy';
import { EMAIL_MAX_LENGTH } from './lib/validation';

// `passwordReset.checkCode` — the code step of "forgot password".
//
// The mutation replays checks that Convex Auth does not export: what is at
// stake is that it keeps AGREEING with the library. So, like
// `password-policy.test.ts`, this file LOADS `auth.ts` and gets every code
// from the real reset flow — hash, provider, account link included. A mock
// of the code table would only prove that the check agrees with the mock.
//
// Four properties, one `describe` each: the code is recognised and NOT
// consumed; any other code is refused; the failure budget is the library's
// own, shared both ways; an unknown address cannot be told from a wrong code.
const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// SITE_URL: sending a code builds an absolute URL. AUTH_DEV_OTP: the code is
// kept in plain text, where the test reads it back (`otp.latestDevCode`).
// JWT_PRIVATE_KEY and CONVEX_SITE_URL: a successful reset OPENS A SESSION,
// hence signs a token — with a throwaway key generated here.
beforeAll(async () => {
  vi.stubEnv('SITE_URL', 'https://exemple.test');
  vi.stubEnv('CONVEX_SITE_URL', 'https://exemple.test');
  vi.stubEnv('AUTH_DEV_OTP', 'true');
  vi.stubEnv('JWT_PRIVATE_KEY', await throwawaySigningKey());
});
afterAll(() => {
  vi.unstubAllEnvs();
});

async function throwawaySigningKey(): Promise<string> {
  const { privateKey } = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const der = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', privateKey),
  );
  const base64 = btoa(String.fromCharCode(...der));
  return `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----`;
}

const EMAIL = 'secretariat@exemple.test';
const OLD_PASSWORD = 'phrase-de-passe-du-secretariat';
const NEW_PASSWORD = 'nouvelle-phrase-de-passe-2026';

type T = TestConvex<typeof schema>;

// A member WITH a password account — the only case where "forgot password"
// sends anything (`flow: 'reset'` requires one, see TESTING.md).
async function memberWithPassword(email = EMAIL): Promise<T> {
  const t = convexTest(schema, modules);
  await addMemberWithPassword(t, email);
  return t;
}

async function addMemberWithPassword(t: T, email: string) {
  await t.run((ctx) => ctx.db.insert('users', { email, role: 'membre' }));
  await t.action(api.auth.signIn, {
    provider: 'password',
    params: { email, password: OLD_PASSWORD, flow: 'signUp' },
  });
}

// The first screen: asks for a code, returns it as the e-mail would carry it.
async function requestResetCode(t: T, email = EMAIL): Promise<string> {
  await t.action(api.auth.signIn, {
    provider: 'password',
    params: { email, flow: 'reset' },
  });
  return await latestCode(t, email);
}

async function latestCode(t: T, email = EMAIL): Promise<string> {
  const code = await t.query(internal.otp.latestDevCode, { email });
  if (code === null) throw new Error(`no code sent to ${email}`);
  return code;
}

// The code screen.
const check = (t: T, code: string, email = EMAIL) =>
  t.mutation(api.passwordReset.checkCode, { email, code });

// The password screen: the library's reset, untouched.
const reset = (t: T, code: string) =>
  t.action(api.auth.signIn, {
    provider: 'password',
    params: {
      email: EMAIL,
      code,
      newPassword: NEW_PASSWORD,
      flow: 'reset-verification',
    },
  });

const signInWith = (t: T, password: string) =>
  t.action(api.auth.signIn, {
    provider: 'password',
    params: { email: EMAIL, password, flow: 'signIn' },
  });

// Six digits guaranteed to differ from `code`.
const otherThan = (code: string) =>
  String((Number(code) + 1) % 1_000_000).padStart(6, '0');

const failureCounters = (t: T) =>
  t.run((ctx) => ctx.db.query('authRateLimits').collect());

describe('Code de réinitialisation — reconnu, jamais consommé', () => {
  it('reconnaît le code émis par le vrai parcours', async () => {
    const t = await memberWithPassword();
    const code = await requestResetCode(t);

    expect(await check(t, code)).toBe('valid');
  });

  it('laisse le code à la réinitialisation, qui aboutit ensuite', async () => {
    const t = await memberWithPassword();
    const code = await requestResetCode(t);
    const sessionsBefore = await t.run(
      async (ctx) => (await ctx.db.query('authSessions').collect()).length,
    );

    // Checked twice — a double submit, a back-and-forth between screens.
    expect(await check(t, code)).toBe('valid');
    expect(await check(t, code)).toBe('valid');
    // Neither consumed nor turned into a session: the check signs no one in.
    expect(
      await t.run((ctx) => ctx.db.query('authVerificationCodes').collect()),
    ).toHaveLength(1);
    expect(
      await t.run(
        async (ctx) => (await ctx.db.query('authSessions').collect()).length,
      ),
    ).toBe(sessionsBefore);

    // The password screen then goes through the library, unchanged...
    expect((await reset(t, code)).tokens?.token).toBeTypeOf('string');
    // ...which is what consumes the code and changes the password.
    expect(await check(t, code)).toBe('invalid');
    expect((await signInWith(t, NEW_PASSWORD)).tokens?.token).toBeTypeOf(
      'string',
    );
    await expect(signInWith(t, OLD_PASSWORD)).rejects.toThrow('InvalidSecret');
  });
});

describe('Code de réinitialisation — tout autre code est refusé', () => {
  it('refuse un code faux', async () => {
    const t = await memberWithPassword();
    const code = await requestResetCode(t);

    expect(await check(t, otherThan(code))).toBe('invalid');
  });

  it('refuse le code de vérification d’adresse, pourtant lié au même compte', async () => {
    // Setting a password sends an ADDRESS VERIFICATION code, attached to
    // the very password account a reset code would be: only the provider
    // tells them apart. Accepting it would move to the password screen with
    // a code the reset then refuses.
    const t = await memberWithPassword();
    const verificationCode = await latestCode(t);

    expect(await check(t, verificationCode)).toBe('invalid');
  });

  it('refuse un code de connexion par code', async () => {
    const t = await memberWithPassword();
    await t.action(api.auth.signIn, {
      provider: 'otp-signin',
      params: { email: EMAIL },
    });

    expect(await check(t, await latestCode(t))).toBe('invalid');
  });

  it('refuse le code d’une autre adresse', async () => {
    const t = await memberWithPassword();
    await addMemberWithPassword(t, 'autre@exemple.test');
    const theirCode = await requestResetCode(t, 'autre@exemple.test');

    expect(await check(t, theirCode)).toBe('invalid');
    // The right pair still works: the refusal is about the address.
    expect(await check(t, theirCode, 'autre@exemple.test')).toBe('valid');
  });

  it('refuse un code lié à un vérificateur, comme la bibliothèque', async () => {
    // A code carrying a PKCE verifier belongs to a link flow: Convex Auth
    // refuses it without one, and the reset presents none.
    const t = await memberWithPassword();
    const code = await requestResetCode(t);
    await t.run(async (ctx) => {
      const [stored] = await ctx.db.query('authVerificationCodes').collect();
      await ctx.db.patch(stored._id, { verifier: 'lien-magique' });
    });

    expect(await check(t, code)).toBe('invalid');
  });

  it('refuse un code expiré', async () => {
    const t = await memberWithPassword();
    const code = await requestResetCode(t);
    await t.run(async (ctx) => {
      const [stored] = await ctx.db.query('authVerificationCodes').collect();
      await ctx.db.patch(stored._id, { expirationTime: Date.now() - 1 });
    });

    expect(await check(t, code)).toBe('invalid');
  });

  it('refuse le code remplacé par un renvoi', async () => {
    const t = await memberWithPassword();
    const first = await requestResetCode(t);
    const second = await requestResetCode(t);

    expect(await check(t, second)).toBe('valid');
    // The first one is gone — unless the draw repeated itself (1 in 10^6).
    expect(await check(t, first)).toBe(first === second ? 'valid' : 'invalid');
  });

  it('écarte une saisie mal formée sans l’écrire nulle part', async () => {
    const t = await memberWithPassword();
    await requestResetCode(t);

    expect(await check(t, '12345')).toBe('invalid');
    expect(await check(t, 'abcdef')).toBe('invalid');
    expect(
      await check(t, '123456', `${'a'.repeat(EMAIL_MAX_LENGTH)}@exemple.test`),
    ).toBe('invalid');
    // Nothing to guess there, so nothing to count: no row an attacker could
    // multiply by varying the input.
    expect(await failureCounters(t)).toEqual([]);
  });
});

describe('Code de réinitialisation — le budget d’échecs est celui de Convex Auth', () => {
  it('bloque après le nombre d’échecs fixé, même avec le bon code', async () => {
    const t = await memberWithPassword();
    const code = await requestResetCode(t);

    for (let i = 0; i < MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR; i++) {
      expect(await check(t, otherThan(code))).toBe('invalid');
    }
    expect(await check(t, code)).toBe('tooManyAttempts');
  });

  it('les échecs comptés ici bloquent aussi la réinitialisation', async () => {
    const t = await memberWithPassword();
    const code = await requestResetCode(t);

    for (let i = 0; i < MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR; i++) {
      await check(t, otherThan(code));
    }
    // One counter, not two: the screen does not open a second budget of
    // guesses next to the library's.
    await expect(reset(t, code)).rejects.toThrow();
    await expect(signInWith(t, NEW_PASSWORD)).rejects.toThrow('InvalidSecret');
  });

  it('les échecs comptés par Convex Auth bloquent aussi la vérification', async () => {
    const t = await memberWithPassword();
    const code = await requestResetCode(t);

    for (let i = 0; i < MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR; i++) {
      await expect(reset(t, otherThan(code))).rejects.toThrow();
    }
    expect(await check(t, code)).toBe('tooManyAttempts');
  });

  it('rend une tentative par tranche de temps, comme la bibliothèque', async () => {
    const t = await memberWithPassword();
    const code = await requestResetCode(t);
    for (let i = 0; i < MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR; i++) {
      await check(t, otherThan(code));
    }
    expect(await check(t, code)).toBe('tooManyAttempts');

    // The credit comes back continuously: one attempt per hour / MAX.
    const slice = (60 * 60 * 1000) / MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR;
    await t.run(async (ctx) => {
      const [counter] = await ctx.db.query('authRateLimits').collect();
      await ctx.db.patch(counter._id, {
        lastAttemptTime: counter.lastAttemptTime - slice - 1000,
      });
    });
    expect(await check(t, code)).toBe('valid');
  });
});

describe('Code de réinitialisation — pas d’oracle d’existence', () => {
  // What the attacker sees, call after call: the whole sequence is compared,
  // including the moment the lock kicks in.
  async function answers(t: T, email: string, probe: string) {
    const seen = [];
    for (let i = 0; i <= MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR; i++) {
      seen.push(await check(t, probe, email));
    }
    return seen;
  }

  it('une adresse inconnue répond exactement comme un code faux', async () => {
    const t = await memberWithPassword();
    // A code IS pending for the known address; the probe is another one.
    const probe = otherThan(await requestResetCode(t));

    const known = await answers(t, EMAIL, probe);
    const unknown = await answers(t, 'inconnu@exemple.test', probe);
    // A member invited without a password: known to the platform, unknown
    // to the Password provider — the case the screen's subtitle points to
    // sign-in by code.
    await t.run((ctx) =>
      ctx.db.insert('users', { email: 'invite@exemple.test', role: 'membre' }),
    );
    const invited = await answers(t, 'invite@exemple.test', probe);

    expect(known).toEqual([
      ...Array(MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR).fill('invalid'),
      'tooManyAttempts',
    ]);
    expect(unknown).toEqual(known);
    expect(invited).toEqual(known);
  });
});

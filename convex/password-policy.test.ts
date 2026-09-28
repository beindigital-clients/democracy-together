// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import type { TestConvex } from 'convex-test';
import {
  MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR,
  PASSWORD_MIN_LENGTH,
} from './lib/passwordPolicy';

// Unlike the other Convex suites, this one LOADS `auth.ts`: what is
// checked here is not an isolated function but the WIRING — a policy
// written somewhere but never passed to the provider protects nothing, and that is
// exactly the failure this file must catch. Left out are the two
// modules `convexTest` does not mount (`auth.config.ts`, `http.ts`).
const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Setting a password ends with sending the verification code, which
// builds an absolute URL: without SITE_URL the account is indeed created but
// the action throws, and we would be testing the environment failure, not the policy.
beforeAll(() => {
  vi.stubEnv('SITE_URL', 'https://exemple.test');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const EMAIL = 'secretariat@exemple.test';
const VALID_PASSWORD = 'phrase-de-passe-du-secretariat';

// No self-signup: the user ALREADY exists (validated membership or
// invitation) when a password is set. Without this line, the observed
// refusal would be NO_SELF_SIGNUP — the wrong refusal.
async function withMember(): Promise<TestConvex<typeof schema>> {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert('users', { email: EMAIL, role: 'membre' }),
  );
  return t;
}

const setPassword = (t: TestConvex<typeof schema>, password: string) =>
  t.action(api.auth.signIn, {
    provider: 'password',
    params: { email: EMAIL, password, flow: 'signUp' },
  });

const attemptSignIn = (t: TestConvex<typeof schema>, password: string) =>
  t.action(api.auth.signIn, {
    provider: 'password',
    params: { email: EMAIL, password, flow: 'signIn' },
  });

const accounts = (t: TestConvex<typeof schema>) =>
  t.run((ctx) => ctx.db.query('authAccounts').collect());

describe('Politique de mot de passe (sécurité — constat M4)', () => {
  it('reste celle que les commentaires annoncent', () => {
    // Both numbers are spelled out in `convex/auth.ts` and
    // in `convex/lib/passwordPolicy.ts`: moving them without revisiting those
    // comments would bring back an unexamined policy, which is what M4 criticized.
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR).toBe(5);
  });

  it('refuse un mot de passe trop court, sans créer de compte', async () => {
    const t = await withMember();
    const tooShort = 'mot-de-passe'.slice(0, PASSWORD_MIN_LENGTH - 1);

    await expect(setPassword(t, tooShort)).rejects.toMatchObject({
      data: 'PASSWORD_TOO_SHORT',
    });
    // The refusal applies BEFORE creation: a half-set-up account would be worse
    // than a clear refusal.
    expect(await accounts(t)).toHaveLength(0);
  });

  it('refuse les mots de passe les plus courants, même assez longs', async () => {
    const t = await withMember();

    // 13 characters: length alone would not have stopped it.
    await expect(setPassword(t, 'MotDePasse123')).rejects.toMatchObject({
      data: 'PASSWORD_TOO_COMMON',
    });
    // A repeated character — the obvious loophole in a length rule.
    await expect(setPassword(t, 'aaaaaaaaaaaaaa')).rejects.toMatchObject({
      data: 'PASSWORD_TOO_COMMON',
    });
    expect(await accounts(t)).toHaveLength(0);
  });

  it('accepte un mot de passe conforme', async () => {
    const t = await withMember();

    await setPassword(t, VALID_PASSWORD);

    const [account] = await accounts(t);
    expect(account.providerAccountId).toBe(EMAIL);
    expect(account.secret).toBeTruthy();
  });

  it("s'applique aussi au changement de mot de passe, pas seulement à la pose initiale", async () => {
    const t = await withMember();
    await setPassword(t, VALID_PASSWORD);

    // The "forgot password" flow is, given there is no self-signup, the
    // way a member actually changes their password: the
    // policy must apply there too. The code is wrong, and it is the
    // password that is refused first — validation precedes checking the
    // code, so no valid code opens the door to a short password.
    await expect(
      t.action(api.auth.signIn, {
        provider: 'password',
        params: {
          email: EMAIL,
          newPassword: 'court',
          code: '000000',
          flow: 'reset-verification',
        },
      }),
    ).rejects.toMatchObject({ data: 'PASSWORD_TOO_SHORT' });
  });
});

describe('Plafond de tentatives de connexion (sécurité — constat M4)', () => {
  it('bloque le compte après le nombre d’échecs fixé', async () => {
    const t = await withMember();
    await setPassword(t, VALID_PASSWORD);

    // The first N failures are plain wrong-password errors...
    for (let i = 0; i < MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR; i++) {
      await expect(attemptSignIn(t, 'mauvais-mot-de-passe')).rejects.toThrow(
        'InvalidSecret',
      );
    }
    // ...the next one does not even test the password anymore.
    await expect(attemptSignIn(t, 'mauvais-mot-de-passe')).rejects.toThrow(
      'TooManyFailedAttempts',
    );
    // And the cap holds against the RIGHT password: without this, an attacker
    // who guesses right on the last attempt would get in anyway.
    await expect(attemptSignIn(t, VALID_PASSWORD)).rejects.toThrow(
      'TooManyFailedAttempts',
    );
  });

  it('remet le compteur à zéro après une connexion réussie', async () => {
    const t = await withMember();
    await setPassword(t, VALID_PASSWORD);

    for (let i = 0; i < MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR - 1; i++) {
      await expect(attemptSignIn(t, 'mauvais-mot-de-passe')).rejects.toThrow(
        'InvalidSecret',
      );
    }
    await attemptSignIn(t, VALID_PASSWORD);

    // The credit resets in full: someone who often gets it wrong but eventually
    // signs in does not drag around a half-locked account.
    expect(
      await t.run((ctx) => ctx.db.query('authRateLimits').collect()),
    ).toEqual([]);
    await expect(attemptSignIn(t, 'mauvais-mot-de-passe')).rejects.toThrow(
      'InvalidSecret',
    );
  });
});

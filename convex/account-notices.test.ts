// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import { NOTICE_LIMITS } from './accountNotices';
import {
  passwordlessAccountEmail,
  unknownAccountEmail,
} from './lib/accountEmails';
import { SITE_LOCALES } from './lib/locales';

// `accountNotices.requestNotice` — what an address without an account is
// told, now that the code screens say nothing about it (anti-enumeration).
//
// Three properties, one `describe` each: the right notice reaches the right
// address, and only when its code did not go out; the caller learns nothing
// (always `null`, never an error); a notice cannot be turned into a mail
// cannon (reserved domains, per-address cap).

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Without a provider, `sendEmail` only simulates in development mode. Fake
// timers hold the scheduled notices until the test drains them: on real timers
// they were sent after the test, once `afterEach` had removed AUTH_DEV_OTP, and
// logged that failure outside any test.
beforeEach(() => {
  vi.stubEnv('AUTH_DEV_OTP', 'true');
  vi.useFakeTimers();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type T = TestConvex<typeof schema>;

async function notices(t: T) {
  const scheduled = await t.run((ctx) =>
    ctx.db.system.query('_scheduled_functions').collect(),
  );
  return scheduled
    .filter((s) => s.name === 'accountNotices:sendNotice')
    .map((s) => s.args[0]);
}

async function member(t: T, email: string, withPassword: boolean) {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email, role: 'membre' });
    if (withPassword) {
      await ctx.db.insert('authAccounts', {
        userId,
        provider: 'password',
        providerAccountId: email,
      });
    }
  });
}

describe('Le bon avis, à la bonne adresse, seulement sans code', () => {
  it('connexion par code, adresse inconnue : « aucun compte », adresse normalisée', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.accountNotices.requestNotice, {
      email: '  Inconnue@Institut-Sahel.org ',
      purpose: 'signin',
      locale: 'en',
    });
    expect(await notices(t)).toEqual([
      {
        email: 'inconnue@institut-sahel.org',
        kind: 'noAccount',
        purpose: 'signin',
        locale: 'en',
      },
    ]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('connexion par code, compte existant : rien, son code est parti', async () => {
    const t = convexTest(schema, modules);
    await member(t, 'membre@institut-sahel.org', false);
    await t.mutation(api.accountNotices.requestNotice, {
      email: 'Membre@institut-sahel.org',
      purpose: 'signin',
      locale: 'fr',
    });
    expect(await notices(t)).toEqual([]);
  });

  it('mot de passe oublié, adresse inconnue : « aucun compte »', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.accountNotices.requestNotice, {
      email: 'inconnue@institut-sahel.org',
      purpose: 'reset',
      locale: 'fr',
    });
    expect(await notices(t)).toMatchObject([
      { kind: 'noAccount', purpose: 'reset' },
    ]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('mot de passe oublié, membre invité sans mot de passe : « pas encore de mot de passe »', async () => {
    const t = convexTest(schema, modules);
    await member(t, 'invitee@institut-sahel.org', false);
    await t.mutation(api.accountNotices.requestNotice, {
      email: 'invitee@institut-sahel.org',
      purpose: 'reset',
      locale: 'fr',
    });
    expect(await notices(t)).toMatchObject([
      { email: 'invitee@institut-sahel.org', kind: 'noPassword' },
    ]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('mot de passe oublié, compte avec mot de passe : rien, le code est parti', async () => {
    const t = convexTest(schema, modules);
    await member(t, 'membre@institut-sahel.org', true);
    await t.mutation(api.accountNotices.requestNotice, {
      email: 'membre@institut-sahel.org',
      purpose: 'reset',
      locale: 'fr',
    });
    expect(await notices(t)).toEqual([]);
  });
});

describe('L’appelant n’apprend rien', () => {
  it('la réponse est null quelle que soit l’adresse, sans jamais lever', async () => {
    const t = convexTest(schema, modules);
    await member(t, 'membre@institut-sahel.org', true);
    const answers = [];
    for (const email of [
      'inconnue@institut-sahel.org',
      'membre@institut-sahel.org',
      'pas-une-adresse',
      'x@democracytogether.test',
    ]) {
      answers.push(
        await t.mutation(api.accountNotices.requestNotice, {
          email,
          purpose: 'reset',
          locale: 'fr',
        }),
      );
    }
    expect(answers).toEqual([null, null, null, null]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('au-delà du plafond, toujours null : le refus reste muet', async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i <= NOTICE_LIMITS.perAddress.max; i++) {
      expect(
        await t.mutation(api.accountNotices.requestNotice, {
          email: 'inconnue@institut-sahel.org',
          purpose: 'signin',
          locale: 'fr',
        }),
      ).toBeNull();
    }
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});

describe('Pas de canon à e-mails', () => {
  it('les domaines réservés (tests, exemples) ne reçoivent jamais d’avis', async () => {
    const t = convexTest(schema, modules);
    for (const email of [
      'a@democracytogether.test',
      'b@example.com',
      'c@mail.example.org',
      'd@site.invalid',
      'e@poste.localhost',
      'Verif.Claude.1790705731530@Example.com',
    ]) {
      await t.mutation(api.accountNotices.requestNotice, {
        email,
        purpose: 'signin',
        locale: 'fr',
      });
    }
    expect(await notices(t)).toEqual([]);
  });

  it(`au plus ${NOTICE_LIMITS.perAddress.max} avis par adresse et par jour`, async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < NOTICE_LIMITS.perAddress.max + 2; i++) {
      await t.mutation(api.accountNotices.requestNotice, {
        email: 'inconnue@institut-sahel.org',
        purpose: 'signin',
        locale: 'fr',
      });
    }
    expect(await notices(t)).toHaveLength(NOTICE_LIMITS.perAddress.max);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('l’avis planifié part vers l’adresse, dans sa langue', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const t = convexTest(schema, modules);
    await t.mutation(api.accountNotices.requestNotice, {
      email: 'inconnue@institut-sahel.org',
      purpose: 'reset',
      locale: 'ar',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const { subject } = unknownAccountEmail({
      siteUrl: 'http://localhost:3000',
      locale: 'ar',
      purpose: 'reset',
    });
    expect(log).toHaveBeenCalledWith(
      `[DEV EMAIL] -> inconnue@institut-sahel.org : ${subject}`,
    );
  });
});

describe('Contenu des avis', () => {
  it.each(SITE_LOCALES)(
    '%s : « aucun compte » mène à l’adhésion, « sans mot de passe » à la connexion par code',
    (loc) => {
      const signin = unknownAccountEmail({
        siteUrl: 'https://exemple.org/',
        locale: loc,
        purpose: 'signin',
      });
      const reset = unknownAccountEmail({
        siteUrl: 'https://exemple.org',
        locale: loc,
        purpose: 'reset',
      });
      const passwordless = passwordlessAccountEmail({
        siteUrl: 'https://exemple.org',
        locale: loc,
      });
      expect(signin.html).toContain(
        `href="https://exemple.org/${loc}/adhesion"`,
      );
      expect(reset.html).not.toBe(signin.html);
      expect(passwordless.html).toContain(
        `href="https://exemple.org/${loc}/connexion-otp"`,
      );
      expect(passwordless.subject).not.toBe(signin.subject);
      for (const mail of [signin, reset, passwordless]) {
        expect(mail.html).not.toContain('undefined');
        expect(mail.html).toContain(`lang="${loc}"`);
      }
    },
  );
});

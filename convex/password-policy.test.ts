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

// Contrairement aux autres suites Convex, celle-ci CHARGE `auth.ts` : ce qui est
// vérifié ici n'est pas une fonction isolée mais le CÂBLAGE — une politique
// écrite quelque part mais jamais passée au provider ne protège rien, et c'est
// exactement la panne que ce fichier doit attraper. Restent dehors les deux
// modules que `convexTest` ne monte pas (`auth.config.ts`, `http.ts`).
const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// La pose d'un mot de passe s'achève par l'envoi du code de vérification, qui
// construit une URL absolue : sans SITE_URL le compte est bien créé mais
// l'action lève, et l'on testerait la panne d'environnement, pas la politique.
beforeAll(() => {
  vi.stubEnv('SITE_URL', 'https://exemple.test');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const EMAIL = 'secretariat@exemple.test';
const VALID_PASSWORD = 'phrase-de-passe-du-secretariat';

// Pas d'auto-inscription : l'utilisateur existe DÉJÀ (adhésion validée ou
// invitation) quand un mot de passe est posé. Sans cette ligne, le refus
// observé serait NO_SELF_SIGNUP — le mauvais refus.
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
    // Les deux nombres sont écrits en toutes lettres dans `convex/auth.ts` et
    // dans `convex/lib/passwordPolicy.ts` : les déplacer sans rouvrir ces
    // commentaires redonnerait une politique subie, ce que M4 reprochait.
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR).toBe(5);
  });

  it('refuse un mot de passe trop court, sans créer de compte', async () => {
    const t = await withMember();
    const tooShort = 'mot-de-passe'.slice(0, PASSWORD_MIN_LENGTH - 1);

    await expect(setPassword(t, tooShort)).rejects.toMatchObject({
      data: 'PASSWORD_TOO_SHORT',
    });
    // Le refus vaut AVANT la création : un compte à moitié posé serait pire
    // qu'un refus franc.
    expect(await accounts(t)).toHaveLength(0);
  });

  it('refuse les mots de passe les plus courants, même assez longs', async () => {
    const t = await withMember();

    // 13 caractères : la seule longueur ne l'aurait pas arrêté.
    await expect(setPassword(t, 'MotDePasse123')).rejects.toMatchObject({
      data: 'PASSWORD_TOO_COMMON',
    });
    // Un caractère répété — l'échappatoire immédiate à une règle de longueur.
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

    // Le parcours « mot de passe oublié » est, faute d'auto-inscription, la
    // voie par laquelle un membre change réellement de mot de passe : la
    // politique doit y valoir aussi. Le code est faux, et c'est le mot de
    // passe qui est refusé d'abord — la validation précède la vérification du
    // code, donc aucun code valide n'ouvre la porte à un mot de passe court.
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

    // Les N premiers échecs sont de simples erreurs de mot de passe...
    for (let i = 0; i < MAX_FAILED_SIGN_IN_ATTEMPTS_PER_HOUR; i++) {
      await expect(attemptSignIn(t, 'mauvais-mot-de-passe')).rejects.toThrow(
        'InvalidSecret',
      );
    }
    // ...le suivant ne teste même plus le mot de passe.
    await expect(attemptSignIn(t, 'mauvais-mot-de-passe')).rejects.toThrow(
      'TooManyFailedAttempts',
    );
    // Et le plafond tient face au BON mot de passe : sans cela, un attaquant
    // qui tombe juste au dernier essai passerait quand même.
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

    // Le crédit repart entier : quelqu'un qui se trompe souvent mais finit par
    // se connecter ne traîne pas un compte à moitié bloqué.
    expect(
      await t.run((ctx) => ctx.db.query('authRateLimits').collect()),
    ).toEqual([]);
    await expect(attemptSignIn(t, 'mauvais-mot-de-passe')).rejects.toThrow(
      'InvalidSecret',
    );
  });
});

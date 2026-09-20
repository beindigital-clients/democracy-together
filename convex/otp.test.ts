// @vitest-environment edge-runtime
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import { internal } from './_generated/api';
import { emailVerification, passwordReset, emailOtpSignIn } from './otp';
import { RATE_LIMITS } from './lib/rateLimit';

// `otp.ts` n'était couvert par AUCUN test (issue #42). C'est pourtant le SEUL
// chemin de connexion d'un membre invité : le modèle d'adhésion ayant fermé
// l'auto-inscription, un membre entre parce qu'un code lui parvient. Trois
// choses s'y jouent, et chacune casse la connexion d'une façon différente :
//
//   1. LE CODE — six chiffres, zéros en tête compris. Un code tronqué est un
//      code refusé par le vérificateur, donc un membre à la porte.
//   2. LE PLAFOND — l'adresse vient d'un appelant ANONYME (connexion, reset,
//      inscription). Sans plafond appliqué AVANT l'envoi, on inonde la boîte
//      d'un tiers, et la facture e-mail avec.
//   3. LE CODE EN CLAIR — écrit en base sous AUTH_DEV_OTP, jamais autrement.
//      TESTING.md le dit sans détour : ce drapeau posé en production rend
//      lisible en base tout code de connexion émis pendant la fenêtre, admin
//      compris. La garde mérite un test, pas seulement un commentaire.
//
// Ce qui est DÉJÀ couvert ailleurs n'est pas redit ici : le barème du plafond
// (convex/rateLimit.test.ts), la branche Resend de l'adaptateur et son
// fail-fast (convex/email.test.ts), le fait que `latestDevCode` soit une
// internalQuery (convex/dev-oracles.test.ts).

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

const ENV_KEYS = [
  'AUTH_DEV_OTP',
  'AUTH_RESEND_KEY',
  'AUTH_EMAIL_PROVIDER',
  'AUTH_EMAIL_FROM',
] as const;

let saved: Record<string, string | undefined>;

// Convention reprise de bootstrap.test.ts / email.test.ts : on part de l'état
// d'un déploiement de PRODUCTION — aucun de ces drapeaux n'est défini — et
// chaque test pose seulement ce dont il a besoin.
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Provider = typeof emailVerification;

// Les trois flux, avec l'intention que chacun écrit dans `devOtpCodes`.
const PROVIDERS: Array<[nom: string, provider: Provider, purpose: string]> = [
  ['vérification', emailVerification, 'verification'],
  ['reset', passwordReset, 'reset'],
  ['connexion', emailOtpSignIn, 'signin'],
];

// --- Accès aux deux fonctions du provider -----------------------------------
//
// `Email()` (convex-auth) range la configuration fournie dans `options` et
// n'en remonte qu'une partie à la racine ; `convexAuth` fusionne ensuite
// `options` PAR-DESSUS la base (server/provider_utils : `merge(provider,
// provider.options)`). Les valeurs effectives — `id`, `maxAge`, le générateur
// de code — se lisent donc dans `options`.
function generateurDe(p: Provider): () => Promise<string> {
  const generer = p.options?.generateVerificationToken;
  if (!generer) throw new Error('provider OTP sans generateVerificationToken');
  return async () => await generer();
}

type CtxEnvoi = { runMutation: TestConvex<typeof schema>['mutation'] };

// Auth.js type `sendVerificationRequest` avec UN paramètre ; Convex en passe un
// second à l'exécution (le ctx de l'action). otp.ts déclare donc ce ctx
// optionnel — c'est ce qui rend sa fonction assignable au type à un paramètre.
// L'appeler ici AVEC son ctx demande de retrouver la signature réelle.
type EnvoyerCode = (
  params: { identifier: string; token: string },
  ctx?: CtxEnvoi,
) => Promise<void>;

const envoiDe = (p: Provider) =>
  p.sendVerificationRequest as unknown as EnvoyerCode;

// Le ctx minimal que la fonction consomme : elle ne lit QUE `runMutation`.
// Tout autre besoin ferait échouer ces tests — c'est le signal voulu. Les
// mutations appelées sont les VRAIES (`internal.otp.*`), exécutées par
// convex-test : ce sont bien elles qu'on exerce, pas des doublures. Même motif
// que `ctxSeenFrom` dans rateLimit.test.ts.
const ctxDe = (t: TestConvex<typeof schema>): CtxEnvoi => ({
  runMutation: (ref, ...args) => t.mutation(ref, ...args),
});

const codesDe = (t: TestConvex<typeof schema>) =>
  t.run((ctx) => ctx.db.query('devOtpCodes').collect());

describe('Codes OTP — génération', () => {
  it.each(PROVIDERS)('%s : six chiffres, toujours', async (_nom, provider) => {
    const generer = generateurDe(provider);
    for (let i = 0; i < 200; i++) {
      expect(await generer()).toMatch(/^\d{6}$/);
    }
  });

  // LE piège de ce générateur : `(n % 1_000_000).toString()` rend « 42 » une
  // fois sur mille environ. Un code de deux caractères là où le formulaire en
  // attend six, c'est une connexion sur mille qui échoue — le genre de défaut
  // qu'aucun test tiré au hasard n'attrape, et qu'on met des mois à reproduire.
  // On fixe donc la source d'aléa pour viser exactement ces valeurs.
  it.each([
    [0, '000000'],
    [7, '000007'],
    [42, '000042'],
    [999, '000999'],
    [123_456, '123456'],
    [999_999, '999999'],
    [1_000_000, '000000'], // le modulo reboucle : toujours six chiffres
    [4_294_967_295, '967295'], // valeur maximale d'un Uint32
  ])('tirage %i -> code %s (zéros en tête conservés)', async (tirage, code) => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((
      a: Uint32Array,
    ) => {
      a[0] = tirage;
      return a;
    }) as typeof crypto.getRandomValues);

    expect(await generateurDe(emailOtpSignIn)()).toBe(code);
  });

  // Contre-épreuve du test précédent : une fois l'aléa rendu, les codes doivent
  // effectivement varier. Sans cela, un générateur constant passerait les deux
  // premiers tests — et tous les comptes partageraient le même code.
  it('tire des codes variés (l’aléa n’est pas décoratif)', async () => {
    const generer = generateurDe(emailOtpSignIn);
    const vus = new Set<string>();
    for (let i = 0; i < 300; i++) vus.add(await generer());
    // 300 tirages dans 10^6 valeurs : la probabilité d'observer moins de 290
    // valeurs distinctes est négligeable, celle d'en observer une poignée est
    // nulle. Le seuil est là pour attraper un générateur figé, pas une
    // collision.
    expect(vus.size).toBeGreaterThan(290);
  });
});

describe('Codes OTP — les trois flux sont distincts', () => {
  it('chaque provider a son identifiant', () => {
    const ids = PROVIDERS.map(([, p]) => p.options?.id);
    expect(ids).toEqual(['otp-verify', 'otp-reset', 'otp-signin']);
    // Deux flux qui partageraient un identifiant se marcheraient dessus : un
    // code de reset vaudrait connexion, ou l'inverse.
    expect(new Set(ids).size).toBe(3);
  });

  it('les codes expirent au bout de 15 minutes', () => {
    // La durée est ANNONCÉE au destinataire dans le corps de l'e-mail
    // (convex/email.ts) : les deux doivent dire la même chose.
    for (const [, p] of PROVIDERS) expect(p.options?.maxAge).toBe(60 * 15);
  });
});

describe('Codes OTP — plafond d’envoi (anti email-bombing)', () => {
  // Le barème lui-même est couvert par rateLimit.test.ts. Ce qui ne l'est pas,
  // et qui rendrait le plafond DÉCORATIF : la clé de comptage. `enforceSendRate`
  // normalise l'adresse (minuscules, sans espaces) avant de compter — sinon
  // « Victime@… », « VICTIME@… » et « victime@… » ouvrent trois crédits pour
  // une seule boîte, et le plafond se contourne à la touche Maj.
  it('compte les variantes de casse et d’espacement sur le MÊME crédit', async () => {
    const t = convexTest(schema, modules);
    const variantes = [
      'victime@example.org',
      'Victime@example.org',
      'VICTIME@EXAMPLE.ORG',
      '  victime@example.org  ',
      'ViCtImE@ExAmPlE.oRg',
    ];

    // On consomme le crédit en faisant tourner les variantes : si chacune avait
    // sa propre clé, aucune n'approcherait le plafond.
    for (let i = 0; i < RATE_LIMITS.otpSend.max; i++) {
      await t.mutation(internal.otp.enforceSendRate, {
        email: variantes[i % variantes.length],
      });
    }

    for (const email of variantes) {
      await expect(
        t.mutation(internal.otp.enforceSendRate, { email }),
      ).rejects.toMatchObject({ data: 'RATE_LIMITED' });
    }

    // Une AUTRE boîte garde bien son crédit : on a resserré la clé, pas
    // fusionné tout le monde dans un compteur unique.
    await expect(
      t.mutation(internal.otp.enforceSendRate, { email: 'autre@example.org' }),
    ).resolves.not.toThrow();
  });

  // L'ordre est la moitié de la protection : plafonner APRÈS l'envoi laisserait
  // partir chaque e-mail avant de compter.
  it('refuse AVANT de générer, d’écrire ou d’envoyer quoi que ce soit', async () => {
    process.env.AUTH_DEV_OTP = 'true';
    process.env.AUTH_RESEND_KEY = 're_test';
    const t = convexTest(schema, modules);
    const envoyer = envoiDe(emailOtpSignIn);
    const ctx = ctxDe(t);
    const email = 'victime@example.org';

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < RATE_LIMITS.otpSend.max; i++) {
      await envoyer({ identifier: email, token: '111111' }, ctx);
    }
    const envoisLegitimes = fetchMock.mock.calls.length;
    const codesAvant = (await codesDe(t)).length;

    await expect(
      envoyer({ identifier: email, token: '222222' }, ctx),
    ).rejects.toMatchObject({ data: 'RATE_LIMITED' });

    // Rien de plus n'est parti, rien de plus n'a été écrit.
    expect(fetchMock.mock.calls.length).toBe(envoisLegitimes);
    expect(await codesDe(t)).toHaveLength(codesAvant);
  });
});

describe('Codes OTP — stockage en clair, réservé au développement', () => {
  it.each(PROVIDERS)(
    '%s : sous AUTH_DEV_OTP, le code émis est relisible avec son intention',
    async (_nom, provider, purpose) => {
      process.env.AUTH_DEV_OTP = 'true';
      const t = convexTest(schema, modules);

      await envoiDe(provider)(
        { identifier: 'membre@dt.test', token: '123456' },
        ctxDe(t),
      );

      // Le code STOCKÉ doit être celui ENVOYÉ : c'est ce que les E2E relisent
      // pour se connecter. Un code régénéré à l'écriture leur ferait saisir un
      // code que le vérificateur refuse.
      expect(await codesDe(t)).toMatchObject([
        { email: 'membre@dt.test', code: '123456', purpose },
      ]);
    },
  );

  // LA propriété de production (TESTING.md). Sans le drapeau, la table reste
  // VIDE : aucun code de connexion lisible en base, admin compris.
  it.each(PROVIDERS)(
    '%s : sans AUTH_DEV_OTP, RIEN n’est écrit en base',
    async (_nom, provider) => {
      expect(process.env.AUTH_DEV_OTP).toBeUndefined();
      const t = convexTest(schema, modules);

      await envoiDe(provider)(
        { identifier: 'membre@example.org', token: '123456' },
        ctxDe(t),
      );

      expect(await codesDe(t)).toHaveLength(0);
    },
  );

  // La garde compare à la chaîne « true », exactement. Un drapeau posé de
  // travers ne doit pas ouvrir la surface à moitié.
  it.each(['1', 'yes', 'TRUE', 'True', 'true ', ''])(
    'AUTH_DEV_OTP=%o n’ouvre pas le stockage',
    async (valeur) => {
      process.env.AUTH_DEV_OTP = valeur;
      const t = convexTest(schema, modules);

      await envoiDe(emailOtpSignIn)(
        { identifier: 'membre@example.org', token: '123456' },
        ctxDe(t),
      );

      expect(await codesDe(t)).toHaveLength(0);
    },
  );
});

describe('Codes OTP — relecture du dernier code (oracle de test)', () => {
  it('rend le DERNIER code émis pour une adresse', async () => {
    process.env.AUTH_DEV_OTP = 'true';
    const t = convexTest(schema, modules);
    const envoyer = envoiDe(emailOtpSignIn);
    const ctx = ctxDe(t);

    await envoyer({ identifier: 'membre@dt.test', token: '111111' }, ctx);
    await envoyer({ identifier: 'autre@dt.test', token: '999999' }, ctx);
    await envoyer({ identifier: 'membre@dt.test', token: '222222' }, ctx);

    // Un renvoi de code invalide le précédent : l'oracle doit suivre, sinon
    // les E2E saisissent un code périmé dès qu'une spec en redemande un.
    expect(
      await t.query(internal.otp.latestDevCode, { email: 'membre@dt.test' }),
    ).toBe('222222');
    // …et ne mélange pas les adresses.
    expect(
      await t.query(internal.otp.latestDevCode, { email: 'autre@dt.test' }),
    ).toBe('999999');
  });

  it('rend null pour une adresse sans code', async () => {
    process.env.AUTH_DEV_OTP = 'true';
    const t = convexTest(schema, modules);
    expect(
      await t.query(internal.otp.latestDevCode, { email: 'jamais@dt.test' }),
    ).toBeNull();
  });

  it('est fermé sans AUTH_DEV_OTP (l’oracle ne relit rien en production)', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('devOtpCodes', {
        email: 'membre@dt.test',
        code: '123456',
        purpose: 'signin',
        createdAt: Date.now(),
      }),
    );

    // Même avec un code en base — laissé par une fenêtre où le drapeau était
    // posé — la relecture doit être refusée.
    await expect(
      t.query(internal.otp.latestDevCode, { email: 'membre@dt.test' }),
    ).rejects.toThrow(/AUTH_DEV_OTP/);
  });
});

describe('Codes OTP — envoi réel', () => {
  it('adresse .test : aucun e-mail ne part, même avec un fournisseur configuré', async () => {
    // RFC 6761 : `.test` ne résout jamais. Les comptes E2E portent ces
    // adresses ; appeler le fournisseur avec des destinataires factices
    // brûlerait le quota et ferait rougir la suite pour une raison étrangère.
    process.env.AUTH_RESEND_KEY = 're_test';
    const t = convexTest(schema, modules);
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await envoiDe(emailOtpSignIn)(
      { identifier: 'e2e_session_admin@dt.test', token: '123456' },
      ctxDe(t),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adresse réelle : le code part bien chez le fournisseur', async () => {
    // Contre-épreuve : la garde `.test` ne doit pas avaler les envois légitimes.
    process.env.AUTH_RESEND_KEY = 're_test';
    const t = convexTest(schema, modules);
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await envoiDe(emailOtpSignIn)(
      { identifier: 'membre@institut-sahel.org', token: '123456' },
      ctxDe(t),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    const corps = JSON.parse(init.body) as { to: string[]; html: string };
    expect(corps.to).toEqual(['membre@institut-sahel.org']);
    expect(corps.html).toContain('123456');
  });

  it('sans fournisseur : journalise au lieu de lever (la connexion locale tient)', async () => {
    // `sendEmail` échoue volontairement sans fournisseur (audit H3) ; l'OTP ne
    // doit pas l'appeler dans ce cas, sinon aucune connexion ne serait possible
    // sur un déploiement de dev tout neuf.
    const t = convexTest(schema, modules);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      envoiDe(emailOtpSignIn)(
        { identifier: 'membre@example.org', token: '123456' },
        ctxDe(t),
      ),
    ).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });
});

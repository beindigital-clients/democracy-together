// @vitest-environment edge-runtime
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import { internal } from './_generated/api';
import { emailVerification, passwordReset, emailOtpSignIn } from './otp';
import { RATE_LIMITS } from './lib/rateLimit';

// `otp.ts` was covered by NO test (issue #42). Yet it is the ONLY
// sign-in path for an invited member: since the membership model closed
// self-signup, a member gets in because a code reaches them. Three
// things are at stake, and each breaks sign-in in a different way:
//
//   1. THE CODE — six digits, leading zeros included. A truncated code is a
//      code refused by the verifier, hence a member locked out.
//   2. THE CAP — the address comes from an ANONYMOUS caller (sign-in, reset,
//      signup). Without a cap applied BEFORE sending, we flood a third party's
//      inbox, and the email bill with it.
//   3. THE PLAINTEXT CODE — written to the database under AUTH_DEV_OTP, never otherwise.
//      TESTING.md says it bluntly: this flag set in production makes
//      every sign-in code issued during the window readable in the database, admin
//      included. The guard deserves a test, not just a comment.
//
// What is ALREADY covered elsewhere is not repeated here: the cap schedule
// (convex/rateLimit.test.ts), the adapter's Resend branch and its
// fail-fast (convex/email.test.ts), the fact that `latestDevCode` is an
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

// Convention taken from bootstrap.test.ts / email.test.ts: we start from the state
// of a PRODUCTION deployment — none of these flags is defined — and
// each test sets only what it needs.
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

// The three flows, with the intent each one writes into `devOtpCodes`.
const PROVIDERS: Array<[nom: string, provider: Provider, purpose: string]> = [
  ['vérification', emailVerification, 'verification'],
  ['reset', passwordReset, 'reset'],
  ['connexion', emailOtpSignIn, 'signin'],
];

// --- Access to the provider's two functions ---------------------------------
//
// `Email()` (convex-auth) stores the supplied configuration in `options` and
// only surfaces part of it at the root; `convexAuth` then merges
// `options` ON TOP of the base (server/provider_utils: `merge(provider,
// provider.options)`). The effective values — `id`, `maxAge`, the code
// generator — are therefore read from `options`.
function generateurDe(p: Provider): () => Promise<string> {
  const generer = p.options?.generateVerificationToken;
  if (!generer) throw new Error('provider OTP sans generateVerificationToken');
  return async () => await generer();
}

type CtxEnvoi = { runMutation: TestConvex<typeof schema>['mutation'] };

// Auth.js types `sendVerificationRequest` with ONE parameter; Convex passes a
// second one at runtime (the action's ctx). otp.ts therefore declares this ctx
// optional — that is what makes its function assignable to the one-parameter type.
// Calling it here WITH its ctx requires recovering the real signature.
type EnvoyerCode = (
  params: { identifier: string; token: string },
  ctx?: CtxEnvoi,
) => Promise<void>;

const envoiDe = (p: Provider) =>
  p.sendVerificationRequest as unknown as EnvoyerCode;

// The minimal ctx the function consumes: it reads ONLY `runMutation`.
// Any other need would make these tests fail — that is the intended signal. The
// mutations called are the REAL ones (`internal.otp.*`), run by
// convex-test: they are indeed what we exercise, not doubles. Same pattern
// as `ctxSeenFrom` in rateLimit.test.ts.
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

  // THE trap of this generator: `(n % 1_000_000).toString()` yields "42" about
  // once in a thousand. A two-character code where the form
  // expects six is one sign-in in a thousand failing — the kind of defect
  // no randomly drawn test catches, and that takes months to reproduce.
  // So we pin the randomness source to hit exactly these values.
  it.each([
    [0, '000000'],
    [7, '000007'],
    [42, '000042'],
    [999, '000999'],
    [123_456, '123456'],
    [999_999, '999999'],
    [1_000_000, '000000'], // the modulo wraps around: always six digits
    [4_294_967_295, '967295'], // maximum value of a Uint32
  ])('tirage %i -> code %s (zéros en tête conservés)', async (tirage, code) => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((
      a: Uint32Array,
    ) => {
      a[0] = tirage;
      return a;
    }) as typeof crypto.getRandomValues);

    expect(await generateurDe(emailOtpSignIn)()).toBe(code);
  });

  // Counter-check of the previous test: once randomness is restored, the codes must
  // actually vary. Without this, a constant generator would pass the first two
  // tests — and all accounts would share the same code.
  it('tire des codes variés (l’aléa n’est pas décoratif)', async () => {
    const generer = generateurDe(emailOtpSignIn);
    const vus = new Set<string>();
    for (let i = 0; i < 300; i++) vus.add(await generer());
    // 300 draws among 10^6 values: the probability of observing fewer than 290
    // distinct values is negligible, that of observing only a handful is
    // zero. The threshold is there to catch a frozen generator, not a
    // collision.
    expect(vus.size).toBeGreaterThan(290);
  });
});

describe('Codes OTP — les trois flux sont distincts', () => {
  it('chaque provider a son identifiant', () => {
    const ids = PROVIDERS.map(([, p]) => p.options?.id);
    expect(ids).toEqual(['otp-verify', 'otp-reset', 'otp-signin']);
    // Two flows sharing an id would step on each other: a
    // reset code would count as sign-in, or vice versa.
    expect(new Set(ids).size).toBe(3);
  });

  it('les codes expirent au bout de 15 minutes', () => {
    // The duration is ANNOUNCED to the recipient in the email body
    // (convex/email.ts): both must say the same thing.
    for (const [, p] of PROVIDERS) expect(p.options?.maxAge).toBe(60 * 15);
  });
});

describe('Codes OTP — plafond d’envoi (anti email-bombing)', () => {
  // The schedule itself is covered by rateLimit.test.ts. What is not,
  // and would make the cap DECORATIVE: the counting key. `enforceSendRate`
  // normalizes the address (lowercase, no spaces) before counting — otherwise
  // "Victime@…", "VICTIME@…" and "victime@…" open three credits for
  // a single inbox, and the cap is bypassed with the Shift key.
  it('compte les variantes de casse et d’espacement sur le MÊME crédit', async () => {
    const t = convexTest(schema, modules);
    const variantes = [
      'victime@example.org',
      'Victime@example.org',
      'VICTIME@EXAMPLE.ORG',
      '  victime@example.org  ',
      'ViCtImE@ExAmPlE.oRg',
    ];

    // We consume the credit by rotating the variants: if each one had
    // its own key, none would approach the cap.
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

    // ANOTHER inbox does keep its credit: we tightened the key, we did not
    // merge everyone into a single counter.
    await expect(
      t.mutation(internal.otp.enforceSendRate, { email: 'autre@example.org' }),
    ).resolves.not.toThrow();
  });

  // The order is half of the protection: capping AFTER sending would let
  // each email go out before counting.
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

    // Nothing more went out, nothing more was written.
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

      // The STORED code must be the one SENT: that is what the E2E read back
      // to sign in. A code regenerated on write would make them enter a
      // code the verifier refuses.
      expect(await codesDe(t)).toMatchObject([
        { email: 'membre@dt.test', code: '123456', purpose },
      ]);
    },
  );

  // THE production property (TESTING.md). Without the flag, the table stays
  // EMPTY: no sign-in code readable in the database, admin included.
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

  // The guard compares against the string "true", exactly. A flag set
  // wrongly must not half-open the surface.
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

    // Resending a code invalidates the previous one: the oracle must follow, otherwise
    // the E2E enter a stale code as soon as a spec requests a new one.
    expect(
      await t.query(internal.otp.latestDevCode, { email: 'membre@dt.test' }),
    ).toBe('222222');
    // …and does not mix up addresses.
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

    // Even with a code in the database — left over from a window when the flag was
    // set — reading it back must be refused.
    await expect(
      t.query(internal.otp.latestDevCode, { email: 'membre@dt.test' }),
    ).rejects.toThrow(/AUTH_DEV_OTP/);
  });
});

describe('Codes OTP — envoi réel', () => {
  it('adresse .test : aucun e-mail ne part, même avec un fournisseur configuré', async () => {
    // RFC 6761: `.test` never resolves. E2E accounts carry these
    // addresses; calling the provider with dummy recipients
    // would burn the quota and turn the suite red for an unrelated reason.
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
    // Counter-check: the `.test` guard must not swallow legitimate sends.
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
    // `sendEmail` deliberately fails without a provider (audit H3); the OTP must
    // not call it in that case, otherwise no sign-in would be possible
    // on a brand-new dev deployment.
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

// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import {
  CONFIRM_MAX_SENDS,
  CONFIRM_RESEND_MIN_INTERVAL_MS,
  hashToken,
} from './lib/newsletterOptIn';

// NEWSLETTER DOUBLE OPT-IN (F-18, diffusion workstream).
//
// What is guaranteed here: a sign-up subscribes no one until the link
// is followed; the link token is single-use, expires, and is
// NEVER stored in clear; resending is bounded; expired pending entries are
// purged; proof of consent is kept; and public responses
// remain indistinguishable (existence oracle, F-09).

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// A sign-up schedules its confirmation with `runAfter(0)`.
// Left alone, it runs once the test lets go of the event loop, after the
// test has ended, and a log landing during the file's teardown fails the
// whole Vitest run (see convex/newsletter.test.ts). Each instance is
// drained before its test ends, before the environment is unstubbed.
const drains: (() => Promise<void>)[] = [];
function newConvexTest() {
  const t = convexTest(schema, modules);
  drains.push(() => t.finishAllScheduledFunctions(vi.runAllTimers));
  return t;
}
async function drainScheduled() {
  vi.useFakeTimers();
  try {
    for (const drain of drains.splice(0)) await drain();
  } finally {
    vi.useRealTimers();
  }
}

afterEach(async () => {
  await drainScheduled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type Sent = { to: string[]; subject: string; html: string };

/**
 * Simulated Resend provider: captures what "goes out" TO `recipient`.
 *
 * `fetch` is a GLOBAL stub: a previous test's scheduled send, which finishes
 * late on a slow machine, lands in the next test's stub (seen twice
 * in CI on 27/09). Each test therefore counts only the e-mails addressed
 * to ITS address; the others are accepted without being counted.
 */
function resendCapture(recipient: string) {
  const sent: Sent[] = [];
  const target = recipient.toLowerCase();
  vi.stubEnv('AUTH_RESEND_KEY', 're_test');
  vi.stubEnv('AUTH_EMAIL_PROVIDER', 'resend');
  vi.stubEnv('SITE_URL', 'https://dt.test');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      const mail = JSON.parse(init.body) as Sent;
      if (mail.to.includes(target)) sent.push(mail);
      return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
    }),
  );
  return sent;
}

function tokenFrom(html: string): string {
  const m = /token=([0-9a-f]{64})/.exec(html);
  if (!m) throw new Error('aucun jeton dans le courriel');
  return m[1];
}

async function allSubs(t: ReturnType<typeof convexTest>) {
  return await t.run((ctx) =>
    ctx.db.query('newsletterSubscriptions').collect(),
  );
}

describe('Double opt-in — inscription et confirmation', () => {
  it('crée une ATTENTE, envoie le lien, et ne stocke que l’empreinte du jeton', async () => {
    vi.useFakeTimers();
    const sent = resendCapture('awa@example.org');
    const t = newConvexTest();

    await t.mutation(internal.newsletter.recordSubscription, {
      email: 'Awa@Example.org',
      locale: 'pt',
      source: 'footer',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [sub] = await allSubs(t);
    expect(sub.status).toBe('pending');
    expect(sub.email).toBe('awa@example.org');
    // Proof of consent: date, source, language, text version.
    expect(sub.consent).toMatchObject({
      source: 'footer',
      locale: 'pt',
      textVersion: expect.any(String),
    });
    expect(sub.consent?.at).toBeGreaterThan(0);

    // One e-mail, in the subscriber's language, pointing to the page in THEIR language.
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(['awa@example.org']);
    expect(sent[0].html).toContain(
      'https://dt.test/pt/newsletter/confirmation',
    );
    const token = tokenFrom(sent[0].html);

    // IN CLEAR, NEVER STORED: not in the subscription, not in the dev mailbox
    // (empty outside AUTH_DEV_OTP), nowhere else in the row.
    expect(JSON.stringify(sub)).not.toContain(token);
    expect(sub.confirmTokenHash).toBe(await hashToken(token));
    expect(await t.run((ctx) => ctx.db.query('devOutbox').collect())).toEqual(
      [],
    );

    // Not subscribed yet: the recipient counter stays at zero.
    const ed = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'editeur', email: 'ed@dt.test' }),
    );
    const asEd = t.withIdentity({ subject: `${ed}|s` });
    expect(await asEd.query(api.newsletter.subscriberCount, {})).toBe(0);

    // Confirmation: the token opens the subscription, and states the language.
    expect(await t.mutation(api.newsletter.confirm, { token })).toEqual({
      status: 'confirmed',
      locale: 'pt',
    });
    const [after] = await allSubs(t);
    expect(after.status).toBe('confirmed');
    expect(after.confirmedAt).toBeGreaterThan(0);
    expect(after.confirmTokenHash).toBeUndefined();
    expect(await asEd.query(api.newsletter.subscriberCount, {})).toBe(1);

    // SINGLE USE: the same link, clicked a second time, is no longer valid.
    expect(await t.mutation(api.newsletter.confirm, { token })).toEqual({
      status: 'invalid',
      locale: null,
    });
    expect(await asEd.query(api.newsletter.subscriberCount, {})).toBe(1);
  });

  it('refuse un jeton EXPIRÉ, sans confirmer', async () => {
    const t = newConvexTest();
    const token = 'a'.repeat(64);
    const hash = await hashToken(token);
    await t.run((ctx) =>
      ctx.db.insert('newsletterSubscriptions', {
        email: 'tard@dt.test',
        createdAt: 0,
        status: 'pending',
        confirmTokenHash: hash,
        confirmExpiresAt: Date.now() - 1,
      }),
    );
    expect(await t.mutation(api.newsletter.confirm, { token })).toEqual({
      status: 'expired',
      locale: null,
    });
    const [sub] = await allSubs(t);
    expect(sub.status).toBe('pending');
  });

  it('refuse un jeton inventé ou mal formé, sans rien toucher', async () => {
    const t = newConvexTest();
    await t.run((ctx) =>
      ctx.db.insert('newsletterSubscriptions', {
        email: 'temoin@dt.test',
        createdAt: 0,
        status: 'pending',
        confirmTokenHash: 'b'.repeat(64),
        confirmExpiresAt: Date.now() + 60_000,
      }),
    );
    for (const token of ['', 'pas-un-jeton', 'b'.repeat(64), 'c'.repeat(64)]) {
      expect((await t.mutation(api.newsletter.confirm, { token })).status).toBe(
        'invalid',
      );
    }
    const [sub] = await allSubs(t);
    expect(sub.status).toBe('pending');
  });

  it('un nouveau lien REMPLACE le précédent : seul le dernier confirme', async () => {
    vi.useFakeTimers();
    const sent = resendCapture('deux@dt.test');
    const t = newConvexTest();
    await t.mutation(internal.newsletter.recordSubscription, {
      email: 'deux@dt.test',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.setSystemTime(Date.now() + CONFIRM_RESEND_MIN_INTERVAL_MS + 1);
    await t.mutation(internal.newsletter.recordSubscription, {
      email: 'deux@dt.test',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(sent).toHaveLength(2);
    const [vieux, neuf] = sent.map((m) => tokenFrom(m.html));
    expect(vieux).not.toBe(neuf);
    expect(
      (await t.mutation(api.newsletter.confirm, { token: vieux })).status,
    ).toBe('invalid');
    expect(
      (await t.mutation(api.newsletter.confirm, { token: neuf })).status,
    ).toBe('confirmed');
  });
});

describe('Double opt-in — renvoi borné et réinscriptions', () => {
  it('se réinscrire en attente renvoie le lien, au plus 3 fois, jamais deux fois en 10 min', async () => {
    vi.useFakeTimers();
    const sent = resendCapture('insiste@dt.test');
    const t = newConvexTest();
    const inscrire = () =>
      t.mutation(internal.newsletter.recordSubscription, {
        email: 'insiste@dt.test',
      });

    await inscrire();
    await inscrire(); // too early: nothing goes out
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(sent).toHaveLength(1);

    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(Date.now() + CONFIRM_RESEND_MIN_INTERVAL_MS + 1);
      // The per-address cap (5/h) is a separate bound: we set it
      // aside by advancing one hour between two attempts.
      vi.setSystemTime(Date.now() + 60 * 60 * 1000);
      await inscrire();
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    }
    expect(sent).toHaveLength(CONFIRM_MAX_SENDS);
    const [sub] = await allSubs(t);
    expect(sub.confirmSends).toBe(CONFIRM_MAX_SENDS);
  });

  it('un abonné CONFIRMÉ qui se réinscrit ne reçoit rien et reste confirmé', async () => {
    vi.useFakeTimers();
    const sent = resendCapture('fidele@dt.test');
    const t = newConvexTest();
    await t.run((ctx) =>
      ctx.db.insert('newsletterSubscriptions', {
        email: 'fidele@dt.test',
        createdAt: 0,
        status: 'confirmed',
        unsubToken: 'd'.repeat(32),
      }),
    );
    const r = await t.mutation(internal.newsletter.recordSubscription, {
      email: 'fidele@dt.test',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(r).toEqual({ ok: true, already: true });
    expect(sent).toHaveLength(0);
    expect((await allSubs(t))[0].status).toBe('confirmed');
  });

  it('les réponses publiques sont IDENTIQUES : nouvelle adresse, attente, confirmé (F-09)', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
    vi.stubEnv('RECAPTCHA_DISABLED', 'true');
    vi.stubEnv('AUTH_DEV_OTP', 'true');
    const t = newConvexTest();
    await t.run((ctx) =>
      ctx.db.insert('newsletterSubscriptions', {
        email: 'confirme@dt.test',
        createdAt: 0,
        status: 'confirmed',
      }),
    );
    const reponses = [];
    for (const email of [
      'neuve@dt.test',
      'neuve@dt.test',
      'confirme@dt.test',
    ]) {
      reponses.push(
        JSON.stringify(
          await t.action(api.newsletter.subscribe, { email, captchaToken: '' }),
        ),
      );
    }
    expect(new Set(reponses).size).toBe(1);
  });

  it('sans fournisseur (production), l’inscription est REFUSÉE — pour toute adresse', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
    vi.stubEnv('RECAPTCHA_DISABLED', 'true');
    const t = newConvexTest();
    await expect(
      t.action(api.newsletter.subscribe, {
        email: 'x@dt.test',
        captchaToken: '',
      }),
    ).rejects.toThrow('EMAIL_PROVIDER_NOT_CONFIGURED');
    expect(await allSubs(t)).toEqual([]);
  });

  it('la source déclarée « legacy » par un client est ramenée à « other »', async () => {
    const t = newConvexTest();
    await t.mutation(internal.newsletter.recordSubscription, {
      email: 'ruse@dt.test',
      source: 'legacy',
    });
    expect((await allSubs(t))[0].consent?.source).toBe('other');
  });
});

describe('Double opt-in — purge et oracles de développement', () => {
  it('purge les attentes EXPIRÉES, garde les confirmés et les attentes en cours', async () => {
    const t = newConvexTest();
    await t.run(async (ctx) => {
      await ctx.db.insert('newsletterSubscriptions', {
        email: 'expiree@dt.test',
        createdAt: 0,
        status: 'pending',
        confirmExpiresAt: Date.now() - 1000,
      });
      await ctx.db.insert('newsletterSubscriptions', {
        email: 'encours@dt.test',
        createdAt: 0,
        status: 'pending',
        confirmExpiresAt: Date.now() + 3_600_000,
      });
      await ctx.db.insert('newsletterSubscriptions', {
        email: 'confirme@dt.test',
        createdAt: 0,
        status: 'confirmed',
      });
    });
    expect(
      await t.mutation(internal.newsletter.purgeExpiredPending, {}),
    ).toEqual({ deleted: 1 });
    expect((await allSubs(t)).map((s) => s.email).sort()).toEqual([
      'confirme@dt.test',
      'encours@dt.test',
    ]);
  });

  it('en développement (AUTH_DEV_OTP), le lien est lisible par l’E2E — et nulle part ailleurs', async () => {
    vi.useFakeTimers();
    vi.stubEnv('AUTH_DEV_OTP', 'true');
    vi.stubEnv('SITE_URL', 'https://dt.test');
    const t = newConvexTest();
    await t.mutation(internal.newsletter.recordSubscription, {
      email: 'e2e@dt.test',
      locale: 'ar',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const link = await t.query(internal.newsletter.devLatestConfirmationLink, {
      email: 'e2e@dt.test',
    });
    expect(link).toMatch(
      /^https:\/\/dt\.test\/ar\/newsletter\/confirmation\?token=[0-9a-f]{64}$/,
    );
    expect(
      await t.query(internal.newsletter.devSubscriptionStatus, {
        email: 'e2e@dt.test',
      }),
    ).toBe('pending');
    const token = link!.split('token=')[1];
    await t.mutation(api.newsletter.confirm, { token });
    expect(
      await t.query(internal.newsletter.devSubscriptionStatus, {
        email: 'e2e@dt.test',
      }),
    ).toBe('confirmed');

    // Guard: outside development, the oracle stays silent.
    vi.stubEnv('AUTH_DEV_OTP', '');
    expect(
      await t.query(internal.newsletter.devLatestConfirmationLink, {
        email: 'e2e@dt.test',
      }),
    ).toBeNull();
  });
});

describe('Migration des abonnés hérités', () => {
  it('les relance (attente de 30 jours, source « legacy ») et refuse sans fournisseur', async () => {
    const t = newConvexTest();
    await t.run((ctx) =>
      ctx.db.insert('newsletterSubscriptions', {
        email: 'ancien@dt.test',
        locale: 'es',
        createdAt: 12345,
        unsubToken: 'e'.repeat(32),
      }),
    );
    await expect(
      t.mutation(internal.newsletter.migrateLegacySubscribers, {}),
    ).rejects.toThrow('EMAIL_PROVIDER_NOT_CONFIGURED');
    expect((await allSubs(t))[0].status).toBeUndefined();

    vi.useFakeTimers();
    const sent = resendCapture('ancien@dt.test');
    expect(
      await t.mutation(internal.newsletter.migrateLegacySubscribers, {}),
    ).toEqual({ migrated: 1, done: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [sub] = await allSubs(t);
    expect(sub.status).toBe('pending');
    expect(sub.consent).toMatchObject({ at: 12345, source: 'legacy' });
    expect(sub.confirmExpiresAt! - Date.now()).toBeGreaterThan(29 * 86_400_000);
    expect(sent).toHaveLength(1);
    // The e-mail says WHY we are writing, in the subscriber's language.
    expect(sent[0].html).toContain('/es/newsletter/confirmation');
    expect(sent[0].html).toContain('30');
  });
});

describe('Back-office — liste des abonnés', () => {
  it('réservée aux éditeurs ; montre le statut et la preuve, jamais de jeton', async () => {
    const t = newConvexTest();
    await t.run((ctx) =>
      ctx.db.insert('newsletterSubscriptions', {
        email: 'vu@dt.test',
        createdAt: 1,
        status: 'confirmed',
        confirmedAt: 2,
        unsubToken: 'f'.repeat(32),
        consent: { at: 1, source: 'home', locale: 'fr', textVersion: 'v' },
      }),
    );
    const membre = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'm@dt.test' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${membre}|s` })
        .query(api.newsletter.listSubscribers, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
    ).rejects.toThrow();

    const ed = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'editeur', email: 'e@dt.test' }),
    );
    const res = await t
      .withIdentity({ subject: `${ed}|s` })
      .query(api.newsletter.listSubscribers, {
        paginationOpts: { numItems: 10, cursor: null },
        email: 'VU@dt.test',
      });
    expect(res.page).toHaveLength(1);
    expect(res.page[0]).toMatchObject({
      email: 'vu@dt.test',
      status: 'confirmed',
      consentSource: 'home',
    });
    expect(JSON.stringify(res)).not.toContain('f'.repeat(32));
  });
});

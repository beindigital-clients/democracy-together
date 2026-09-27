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

// DOUBLE OPT-IN DE LA NEWSLETTER (F-18, chantier diffusion).
//
// Ce qui est tenu ici : une inscription n'abonne personne tant que le lien
// n'est pas suivi ; le jeton du lien est à usage unique, expire, et n'est
// JAMAIS stocké en clair ; le renvoi est borné ; les attentes expirées sont
// purgées ; la preuve du consentement est conservée ; et les réponses
// publiques restent indiscernables (oracle d'existence, F-09).

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type Sent = { to: string[]; subject: string; html: string };

/** Fournisseur Resend simulé : capture ce qui « part ». */
function resendCapture() {
  const sent: Sent[] = [];
  vi.stubEnv('AUTH_RESEND_KEY', 're_test');
  vi.stubEnv('AUTH_EMAIL_PROVIDER', 'resend');
  vi.stubEnv('SITE_URL', 'https://dt.test');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body) as Sent);
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
    const sent = resendCapture();
    const t = convexTest(schema, modules);

    await t.mutation(internal.newsletter.recordSubscription, {
      email: 'Awa@Example.org',
      locale: 'pt',
      source: 'footer',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [sub] = await allSubs(t);
    expect(sub.status).toBe('pending');
    expect(sub.email).toBe('awa@example.org');
    // Preuve du consentement : date, source, langue, version du texte.
    expect(sub.consent).toMatchObject({
      source: 'footer',
      locale: 'pt',
      textVersion: expect.any(String),
    });
    expect(sub.consent?.at).toBeGreaterThan(0);

    // Un courriel, dans la langue de l'abonné, vers la page de SA langue.
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(['awa@example.org']);
    expect(sent[0].html).toContain(
      'https://dt.test/pt/newsletter/confirmation',
    );
    const token = tokenFrom(sent[0].html);

    // EN CLAIR, JAMAIS STOCKÉ : ni dans l'abonnement, ni dans la boîte de dev
    // (vide hors AUTH_DEV_OTP), ni nulle part ailleurs dans la ligne.
    expect(JSON.stringify(sub)).not.toContain(token);
    expect(sub.confirmTokenHash).toBe(await hashToken(token));
    expect(await t.run((ctx) => ctx.db.query('devOutbox').collect())).toEqual(
      [],
    );

    // Pas encore abonné : le compteur des destinataires reste à zéro.
    const ed = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'editeur', email: 'ed@dt.test' }),
    );
    const asEd = t.withIdentity({ subject: `${ed}|s` });
    expect(await asEd.query(api.newsletter.subscriberCount, {})).toBe(0);

    // Confirmation : le jeton ouvre l'abonnement, et dit la langue.
    expect(await t.mutation(api.newsletter.confirm, { token })).toEqual({
      status: 'confirmed',
      locale: 'pt',
    });
    const [after] = await allSubs(t);
    expect(after.status).toBe('confirmed');
    expect(after.confirmedAt).toBeGreaterThan(0);
    expect(after.confirmTokenHash).toBeUndefined();
    expect(await asEd.query(api.newsletter.subscriberCount, {})).toBe(1);

    // USAGE UNIQUE : le même lien, cliqué une seconde fois, ne vaut plus.
    expect(await t.mutation(api.newsletter.confirm, { token })).toEqual({
      status: 'invalid',
      locale: null,
    });
    expect(await asEd.query(api.newsletter.subscriberCount, {})).toBe(1);
  });

  it('refuse un jeton EXPIRÉ, sans confirmer', async () => {
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
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
    const sent = resendCapture();
    const t = convexTest(schema, modules);
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
    const sent = resendCapture();
    const t = convexTest(schema, modules);
    const inscrire = () =>
      t.mutation(internal.newsletter.recordSubscription, {
        email: 'insiste@dt.test',
      });

    await inscrire();
    await inscrire(); // trop tôt : rien ne part
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(sent).toHaveLength(1);

    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(Date.now() + CONFIRM_RESEND_MIN_INTERVAL_MS + 1);
      // Le plafond par adresse (5/h) est une autre borne : on le laisse de
      // côté en avançant d'une heure entre deux tentatives.
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
    const sent = resendCapture();
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.newsletter.subscribe, {
        email: 'x@dt.test',
        captchaToken: '',
      }),
    ).rejects.toThrow('EMAIL_PROVIDER_NOT_CONFIGURED');
    expect(await allSubs(t)).toEqual([]);
  });

  it('la source déclarée « legacy » par un client est ramenée à « other »', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.newsletter.recordSubscription, {
      email: 'ruse@dt.test',
      source: 'legacy',
    });
    expect((await allSubs(t))[0].consent?.source).toBe('other');
  });
});

describe('Double opt-in — purge et oracles de développement', () => {
  it('purge les attentes EXPIRÉES, garde les confirmés et les attentes en cours', async () => {
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
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

    // Garde : hors développement, l'oracle se tait.
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
    const t = convexTest(schema, modules);
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
    const sent = resendCapture();
    expect(
      await t.mutation(internal.newsletter.migrateLegacySubscribers, {}),
    ).toEqual({ migrated: 1, done: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [sub] = await allSubs(t);
    expect(sub.status).toBe('pending');
    expect(sub.consent).toMatchObject({ at: 12345, source: 'legacy' });
    expect(sub.confirmExpiresAt! - Date.now()).toBeGreaterThan(29 * 86_400_000);
    expect(sent).toHaveLength(1);
    // Le courriel dit POURQUOI on écrit, dans la langue de l'abonné.
    expect(sent[0].html).toContain('/es/newsletter/confirmation');
    expect(sent[0].html).toContain('30');
  });
});

describe('Back-office — liste des abonnés', () => {
  it('réservée aux éditeurs ; montre le statut et la preuve, jamais de jeton', async () => {
    const t = convexTest(schema, modules);
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

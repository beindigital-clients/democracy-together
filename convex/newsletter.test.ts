// @vitest-environment edge-runtime
import { describe, it, expect, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';

// Public subscription is gated by reCAPTCHA via the `subscribe` action; the
// logic (normalization, dedup, rate-limit) lives in `recordSubscription`,
// which we test directly here (the captcha gate is covered elsewhere).

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// `recordSubscription` schedules the confirmation e-mail (`runAfter(0)`), and
// nothing in the tests below waits for it. Left alone, that send outlives its
// test: it fails for want of a provider and logs AFTER the test has ended.
// When the log lands during the file's teardown, Vitest fails the whole run
// ("EnvironmentTeardownError: Closing rpc while onUserConsoleLog was
// pending": main red twice on 28/09, a push refused by the pre-push hook on
// 30/09). Every test that subscribes someone therefore lets the send finish
// before it ends. Fake timers are needed for this call only: convex-test also
// drains what was scheduled under real timers, once its time has passed.
async function letScheduledSendsFinish(t: ReturnType<typeof convexTest>) {
  vi.useFakeTimers();
  try {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }
}

describe('Newsletter — subscribe (F-18)', () => {
  it('inscrit (normalise), dédupe, rejette une adresse invalide', async () => {
    const t = convexTest(schema, modules);

    const r1 = await t.mutation(internal.newsletter.recordSubscription, {
      email: '  Awa@Example.org ',
    });
    expect(r1.already).toBe(false);

    // email normalized (trim + lowercase), a single row
    const all = await t.run((ctx) =>
      ctx.db.query('newsletterSubscriptions').collect(),
    );
    expect(all).toHaveLength(1);
    expect(all[0].email).toBe('awa@example.org');

    // re-subscription = idempotent, no duplicate
    const r2 = await t.mutation(internal.newsletter.recordSubscription, {
      email: 'awa@example.org',
    });
    expect(r2.already).toBe(true);
    expect(
      (await t.run((ctx) => ctx.db.query('newsletterSubscriptions').collect()))
        .length,
    ).toBe(1);

    // invalid address rejected
    await expect(
      t.mutation(internal.newsletter.recordSubscription, {
        email: 'pas-un-email',
      }),
    ).rejects.toThrow();
    await letScheduledSendsFinish(t);
  });
});

describe('Newsletter — désinscription par jeton', () => {
  it('génère un unsubToken, le retire, reste idempotent', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.newsletter.recordSubscription, {
      email: 'ina@example.org',
    });

    const sub = await t.run((ctx) =>
      ctx.db.query('newsletterSubscriptions').first(),
    );
    expect(sub?.unsubToken).toBeTruthy();
    const token = sub!.unsubToken!;

    const r = await t.mutation(api.newsletter.unsubscribe, { token });
    expect(r).toEqual({ ok: true, found: true });
    expect(
      (await t.run((ctx) => ctx.db.query('newsletterSubscriptions').collect()))
        .length,
    ).toBe(0);

    // a second call (link clicked twice) does not break — but says that
    // nothing matched anymore: the page shows "link expired" rather
    // than an empty confirmation (R-09).
    expect(await t.mutation(api.newsletter.unsubscribe, { token })).toEqual({
      ok: true,
      found: false,
    });
    // empty token ignored
    expect(await t.mutation(api.newsletter.unsubscribe, { token: '' })).toEqual(
      { ok: false, found: false },
    );
    await letScheduledSendsFinish(t);
  });

  it('un jeton inconnu ne retire personne et le dit (R-09)', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.newsletter.recordSubscription, {
      email: 'temoin@example.org',
    });
    expect(
      await t.mutation(api.newsletter.unsubscribe, {
        token: '0000000000000000jeton-inexistant',
      }),
    ).toEqual({ ok: true, found: false });
    // The control subscriber is still there.
    expect(
      await t.run((ctx) => ctx.db.query('newsletterSubscriptions').collect()),
    ).toHaveLength(1);
    await letScheduledSendsFinish(t);
  });
});

describe('Newsletter — campagnes (F-65)', () => {
  async function asEditor(t: ReturnType<typeof convexTest>) {
    const editorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'editeur', email: 'editeur@test.org' }),
    );
    return t.withIdentity({ subject: `${editorId}|s` });
  }

  it('réserve la composition aux éditeurs et au-dessus', async () => {
    const t = convexTest(schema, modules);
    const args = { subject: 'Sujet', body: 'Corps suffisamment long.' };

    // anonymous
    await expect(
      t.mutation(api.newsletter.createCampaign, args),
    ).rejects.toThrow();

    // signed-in visitor
    const visitorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${visitorId}|s` })
        .mutation(api.newsletter.createCampaign, args),
    ).rejects.toThrow();
  });

  it('crée un brouillon, refuse les champs trop courts', async () => {
    const t = convexTest(schema, modules);
    const ed = await asEditor(t);

    await expect(
      ed.mutation(api.newsletter.createCampaign, {
        subject: 'x',
        body: 'court',
      }),
    ).rejects.toThrow();

    const id = await ed.mutation(api.newsletter.createCampaign, {
      subject: 'Lettre de juin',
      body: 'Voici les actualités du réseau ce mois-ci.',
    });
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.status).toBe('draft');
    expect(doc?.subject).toBe('Lettre de juin');
  });

  it('envoie : draft → sending → sent, livre aux CONFIRMÉS (no-op en dev), compte les destinataires', async () => {
    // Force the no-op: no real email whatever the test env. Since the
    // H3 fix, the no-op must be EXPLICIT (AUTH_DEV_OTP=true) — without it,
    // a missing provider is an error (see the next test).
    const prev = process.env.AUTH_EMAIL_PROVIDER;
    const prevDev = process.env.AUTH_DEV_OTP;
    process.env.AUTH_EMAIL_PROVIDER = 'none';
    process.env.AUTH_DEV_OTP = 'true';
    // Sending goes through scheduler.runAfter(...): timers must be advanced
    // (fake timers) to trigger the enqueueing and the batches.
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      // Double opt-in (diffusion workstream): two CONFIRMED subscribers, and one
      // pending that must receive nothing.
      await t.run(async (ctx) => {
        for (const email of ['a@dt.test', 'b@dt.test']) {
          await ctx.db.insert('newsletterSubscriptions', {
            email,
            unsubToken: email.replace(/\W/g, '').padEnd(32, '0'),
            createdAt: Date.now(),
            status: 'confirmed',
          });
        }
        await ctx.db.insert('newsletterSubscriptions', {
          email: 'attente@dt.test',
          unsubToken: 'f'.repeat(32),
          createdAt: Date.now(),
          status: 'pending',
        });
      });

      const ed = await asEditor(t);
      const id = await ed.mutation(api.newsletter.createCampaign, {
        subject: 'Lettre de juin',
        body: 'Actualités du réseau, édition de juin 2026.',
      });

      const r = await ed.mutation(api.newsletter.sendCampaign, {
        campaignId: id,
      });
      expect(r.ok).toBe(true);
      // intermediate status before the scheduled functions run
      expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('sending');

      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const done = await t.run((ctx) => ctx.db.get(id));
      expect(done?.status).toBe('sent');
      expect(done?.recipientCount).toBe(2);
      expect(done?.failedCount).toBe(0);
      expect(done?.totalCount).toBe(2);

      // re-sending a campaign that has already gone out fails
      await expect(
        ed.mutation(api.newsletter.sendCampaign, { campaignId: id }),
      ).rejects.toThrow();
    } finally {
      vi.useRealTimers();
      if (prev === undefined) delete process.env.AUTH_EMAIL_PROVIDER;
      else process.env.AUTH_EMAIL_PROVIDER = prev;
      if (prevDev === undefined) delete process.env.AUTH_DEV_OTP;
      else process.env.AUTH_DEV_OTP = prevDev;
    }
  });

  // Regression guard for audit H3: without a configured email provider, a
  // campaign must NEVER be marked "sent" with a misleading recipient
  // count. Since the 27/09 campaign (R-07), sending is
  // REFUSED before it even starts — with a code the screen translates — and the
  // draft stays a draft; delivery, if called anyway, still marks
  // 'error' without delivering anything.
  it('sans fournisseur (production) : l’envoi est refusé, et la livraison forcée part en erreur, pas en « sent »', async () => {
    const prev = process.env.AUTH_EMAIL_PROVIDER;
    const prevDev = process.env.AUTH_DEV_OTP;
    delete process.env.AUTH_EMAIL_PROVIDER;
    delete process.env.AUTH_DEV_OTP;
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        for (const email of ['a@dt.test', 'b@dt.test']) {
          await ctx.db.insert('newsletterSubscriptions', {
            email,
            unsubToken: email.replace(/\W/g, '').padEnd(32, '0'),
            createdAt: Date.now(),
            status: 'confirmed',
          });
        }
      });

      const ed = await asEditor(t);
      const id = await ed.mutation(api.newsletter.createCampaign, {
        subject: 'Lettre de juillet',
        body: 'Actualités du réseau, édition de juillet 2026.',
      });
      expect(await ed.query(api.newsletter.emailStatus, {})).toMatchObject({
        mode: 'none',
      });
      await expect(
        ed.mutation(api.newsletter.sendCampaign, { campaignId: id }),
      ).rejects.toThrow('EMAIL_PROVIDER_NOT_CONFIGURED');
      expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
        status: 'draft',
      });

      // Delivery itself stays fail-closed (audit H3): we force the
      // campaign into sending (as if the provider had vanished midway)
      // and let the enqueueing and batches run.
      await t.run((ctx) =>
        ctx.db.patch(id, {
          status: 'sending',
          totalCount: 0,
          recipientCount: 0,
          failedCount: 0,
        }),
      );
      await t.mutation(internal.newsletter._enqueue, {
        campaignId: id,
        cursor: null,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const done = await t.run((ctx) => ctx.db.get(id));
      expect(done?.status).toBe('error');
      expect(done?.recipientCount).toBe(0);
      expect(done?.failedCount).toBe(2);
    } finally {
      vi.useRealTimers();
      if (prev === undefined) delete process.env.AUTH_EMAIL_PROVIDER;
      else process.env.AUTH_EMAIL_PROVIDER = prev;
      if (prevDev === undefined) delete process.env.AUTH_DEV_OTP;
      else process.env.AUTH_DEV_OTP = prevDev;
    }
  });
});

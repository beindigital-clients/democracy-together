// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  MIN_INTERVAL_MS,
  batchAllowance,
  deliveryConfig,
  msUntilNextUtcDay,
  utcDay,
} from './lib/newsletterDelivery';
import { INTERNAL_TEST_MAX } from './newsletter';

// CERCLE DES AMIS — SENDING IN WAVES (feature 6).
//
// The campaign engine is the newsletter's, now serving the Cercle's list. What
// is pinned here is how it is TUNED to the sending service (request rate floor,
// daily quota that spreads a send over days), how a campaign goes out in
// WAVES the editor releases, how a failure is tracked and retried, and the
// internal test that must precede a send to the list. The provider is a
// substitute `fetch` that records every request.

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

type T = TestConvex<typeof schema>;
type Email = {
  to: string[];
  subject: string;
  html: string;
  headers?: Record<string, string>;
};
type Call = { url: string; key: string | null; emails: Email[] };

function fakeResend(plan: Array<'ok' | 'down' | number> = [], identity = true) {
  const calls: Call[] = [];
  vi.stubEnv('AUTH_RESEND_KEY', 're_test');
  vi.stubEnv('AUTH_EMAIL_PROVIDER', 'resend');
  vi.stubEnv('SITE_URL', 'https://dt.test');
  vi.stubEnv('CONVEX_SITE_URL', 'https://api.dt.test');
  vi.stubEnv('NEWSLETTER_BATCH_SIZE', '2');
  if (identity) {
    vi.stubEnv('CERCLE_SENDER_NAME', 'Association Fictive');
    vi.stubEnv('CERCLE_SENDER_ADDRESS', '1 rue Imaginaire, 75000 Ville');
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (
        url: string,
        init: { body: string; headers: Record<string, string> },
      ) => {
        const step = plan.shift() ?? 'ok';
        const body = JSON.parse(init.body) as Email | Email[];
        const emails = Array.isArray(body) ? body : [body];
        calls.push({
          url,
          key: init.headers['Idempotency-Key'] ?? null,
          emails,
        });
        if (step === 'down') throw new TypeError('fetch failed');
        if (typeof step === 'number') {
          return new Response('{"message":"refus"}', { status: step });
        }
        return new Response(
          JSON.stringify({ data: emails.map((_, i) => ({ id: `id${i}` })) }),
          { status: 200 },
        );
      },
    ),
  );
  return calls;
}

const hex = (s: string) =>
  [...s]
    .map((c) => c.charCodeAt(0).toString(16))
    .join('')
    .slice(0, 32)
    .padEnd(32, '0');
const batchCalls = (calls: Call[]) =>
  calls.filter((c) => c.url.endsWith('/emails/batch'));
const sentTo = (calls: Call[]) =>
  batchCalls(calls).flatMap((c) => c.emails.flatMap((e) => e.to));

async function seedList(t: T, n = 5) {
  await t.run(async (ctx) => {
    for (let i = 1; i <= n; i++) {
      await ctx.db.insert('cercleContacts', {
        email: `ami${i}@dt.test`,
        status: 'confirmed',
        source: 'request',
        unsubToken: hex(`ami${i}`),
        confirmSends: 0,
        createdAt: 0,
        locale: 'fr',
      });
    }
  });
  const editorId = await t.run((ctx) =>
    ctx.db.insert('users', { email: 'ed@dt.test', role: 'editeur' }),
  );
  return t.withIdentity({ subject: `${editorId}|s` });
}

async function circleCampaign(t: T, editor: ReturnType<T['withIdentity']>) {
  const id = await editor.mutation(api.newsletter.createCampaign, {
    subject: 'Nouvelles du Cercle',
    body: 'Quelques nouvelles.',
    audience: 'cercle',
  });
  // The internal test is covered below; most tests only need it done.
  await t.run((ctx) => ctx.db.patch(id, { lastTestAt: Date.now() + 1 }));
  return id as Id<'newsletterCampaigns'>;
}

describe('Waves — cadence tuned to the sending service', () => {
  it('never paces batches faster than the provider’s request rate allows', () => {
    // A rate set far too high used to give a 200 ms pause (5 requests/s) against
    // a provider limit of 2 requests/s.
    vi.stubEnv('NEWSLETTER_RATE_PER_MINUTE', '6000');
    vi.stubEnv('NEWSLETTER_BATCH_SIZE', '10');
    expect(deliveryConfig().intervalMs).toBe(MIN_INTERVAL_MS);
    expect(MIN_INTERVAL_MS).toBeGreaterThanOrEqual(500);
    // The default stays gentle: 50 messages every 5 s.
    vi.unstubAllEnvs();
    expect(deliveryConfig()).toMatchObject({
      batchSize: 50,
      intervalMs: 5000,
      dailyLimit: undefined,
    });
  });

  it('reads the daily cap from the deployment, and ignores nonsense', () => {
    vi.stubEnv('EMAIL_DAILY_LIMIT', '100');
    expect(deliveryConfig().dailyLimit).toBe(100);
    vi.stubEnv('EMAIL_DAILY_LIMIT', '0');
    expect(deliveryConfig().dailyLimit).toBeUndefined();
    vi.stubEnv('EMAIL_DAILY_LIMIT', 'beaucoup');
    expect(deliveryConfig().dailyLimit).toBeUndefined();
  });

  it('sizes a batch by the tightest of batch size, daily quota and wave', () => {
    expect(
      batchAllowance({
        batchSize: 50,
        dailyRemaining: undefined,
        waveRemaining: undefined,
      }),
    ).toEqual({
      size: 50,
      limitedBy: 'none',
    });
    expect(
      batchAllowance({
        batchSize: 50,
        dailyRemaining: 20,
        waveRemaining: undefined,
      }),
    ).toEqual({
      size: 20,
      limitedBy: 'daily',
    });
    expect(
      batchAllowance({ batchSize: 50, dailyRemaining: 20, waveRemaining: 5 }),
    ).toEqual({
      size: 5,
      limitedBy: 'wave',
    });
    expect(
      batchAllowance({ batchSize: 50, dailyRemaining: 0, waveRemaining: 30 }),
    ).toEqual({
      size: 0,
      limitedBy: 'daily',
    });
    expect(
      batchAllowance({ batchSize: 50, dailyRemaining: 100, waveRemaining: 0 }),
    ).toEqual({
      size: 0,
      limitedBy: 'wave',
    });
  });

  it('counts days in UTC and finds the next midnight', () => {
    const noon = Date.UTC(2026, 10, 13, 12, 0, 0);
    expect(utcDay(noon)).toBe('2026-11-13');
    expect(msUntilNextUtcDay(noon)).toBe(12 * 3600 * 1000 + 1);
    expect(utcDay(noon + msUntilNextUtcDay(noon))).toBe('2026-11-14');
  });
});

describe('Waves — the daily quota spreads a send over days', () => {
  it('goes out over as many days as the cap needs, never above the cap in a day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 13, 10, 0, 0));
    const calls = fakeResend();
    vi.stubEnv('EMAIL_DAILY_LIMIT', '3');
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 5);
    const id = await circleCampaign(t, editor);
    await editor.mutation(api.newsletter.sendCampaign, { campaignId: id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Every contact served exactly once, over two days: 3 then 2.
    expect(sentTo(calls).sort()).toEqual([
      'ami1@dt.test',
      'ami2@dt.test',
      'ami3@dt.test',
      'ami4@dt.test',
      'ami5@dt.test',
    ]);
    const days = (await t.run((ctx) => ctx.db.query('emailQuota').collect()))
      .map((d) => [d.day, d.sent])
      .sort();
    expect(days).toEqual([
      ['2026-11-13', 3],
      ['2026-11-14', 2],
    ]);
    const done = await t.run((ctx) => ctx.db.get(id));
    expect(done).toMatchObject({ status: 'sent', recipientCount: 5 });
    // The "paused until tomorrow" note is cleared once the send completes.
    expect(done?.pausedUntil).toBeUndefined();
  });

  it('with today’s quota already spent, nothing goes out and the screen can say until when', async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 10, 13, 10, 0, 0);
    vi.setSystemTime(now);
    const calls = fakeResend();
    vi.stubEnv('EMAIL_DAILY_LIMIT', '3');
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 2);
    const id = await circleCampaign(t, editor);
    await t.run((ctx) =>
      ctx.db.insert('emailQuota', { day: utcDay(now), sent: 3 }),
    );
    await editor.mutation(api.newsletter.sendCampaign, { campaignId: id });
    // One tick: enqueueing, then the first batch claim. The retry after
    // midnight is a far-off timer, NOT run here.
    await vi.advanceTimersByTimeAsync(100);
    await t.finishInProgressScheduledFunctions();

    expect(batchCalls(calls)).toHaveLength(0);
    const campaign = await t.run((ctx) => ctx.db.get(id));
    expect(campaign?.status).toBe('sending');
    expect(campaign?.pausedUntil).toBe(now + msUntilNextUtcDay(now));
    const [row] = await editor.query(api.newsletter.listCampaigns, {
      audience: 'cercle',
    });
    expect(row.pausedUntil).toBe(now + msUntilNextUtcDay(now));
  });

  it('the newsletter is held back by the same quota (one account at the provider)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 13, 10, 0, 0));
    const calls = fakeResend();
    vi.stubEnv('EMAIL_DAILY_LIMIT', '1');
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 0);
    await t.run(async (ctx) => {
      for (const e of ['n1@dt.test', 'n2@dt.test']) {
        await ctx.db.insert('newsletterSubscriptions', {
          email: e,
          unsubToken: hex(e),
          createdAt: 0,
          status: 'confirmed',
          locale: 'fr',
        });
      }
    });
    const id = await editor.mutation(api.newsletter.createCampaign, {
      subject: 'La lettre',
      body: 'Les travaux du réseau.',
    });
    await editor.mutation(api.newsletter.sendCampaign, { campaignId: id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(sentTo(calls).sort()).toEqual(['n1@dt.test', 'n2@dt.test']);
    expect(
      (await t.run((ctx) => ctx.db.query('emailQuota').collect())).map(
        (d) => d.sent,
      ),
    ).toEqual([1, 1]);
  });
});

describe('Waves — the confirmation message obeys the same quota', () => {
  it('spreads the one confirmation message over days, once per contact', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 13, 10, 0, 0));
    const calls = fakeResend();
    vi.stubEnv('EMAIL_DAILY_LIMIT', '2');
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'president@dt.test', role: 'admin' }),
    );
    const admin = t.withIdentity({ subject: `${adminId}|s` });
    await admin.mutation(api.cercleMailing.importContacts, {
      csv: [
        'email',
        ...[1, 2, 3, 4, 5].map((i) => `delivered+q${i}@resend.dev`),
      ].join('\n'),
      batch: 'quota',
    });
    await admin.mutation(api.cercleMailing.sendConfirmations, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(sentTo(calls)).toHaveLength(5);
    expect(new Set(sentTo(calls)).size).toBe(5);
    const days = (await t.run((ctx) => ctx.db.query('emailQuota').collect()))
      .map((d) => [d.day, d.sent])
      .sort();
    expect(days).toEqual([
      ['2026-11-13', 2],
      ['2026-11-14', 2],
      ['2026-11-15', 1],
    ]);
  });
});

describe('Waves — sending in waves the editor releases', () => {
  it('serves a wave, holds the campaign, and goes on only when the next wave is released', async () => {
    vi.useFakeTimers();
    const calls = fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 5);
    const id = await circleCampaign(t, editor);
    await editor.mutation(api.newsletter.sendCampaign, {
      campaignId: id,
      waveSize: 3,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Batches of 2 under a wave of 3: 2 then 1, then held.
    expect(batchCalls(calls).map((c) => c.emails.length)).toEqual([2, 1]);
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: 'paused',
      recipientCount: 3,
      waveLimit: 3,
    });
    const [row] = await editor.query(api.newsletter.listCampaigns, {
      audience: 'cercle',
    });
    expect(row).toMatchObject({ status: 'paused', waveLimit: 3 });

    // Nothing moves on its own.
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(sentTo(calls)).toHaveLength(3);

    // The next wave: the rest (2), which finishes the campaign.
    expect(
      await editor.mutation(api.newsletter.releaseNextWave, {
        campaignId: id,
        size: 10,
      }),
    ).toEqual({
      ok: true,
      waveLimit: 13,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(sentTo(calls).sort()).toEqual([
      'ami1@dt.test',
      'ami2@dt.test',
      'ami3@dt.test',
      'ami4@dt.test',
      'ami5@dt.test',
    ]);
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: 'sent',
      recipientCount: 5,
    });
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(
      audit.filter((a) => a.action === 'newsletter.wave_released'),
    ).toHaveLength(1);
  });

  it('a wave that is exactly the list simply finishes (nothing to hold)', async () => {
    vi.useFakeTimers();
    fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 2);
    const id = await circleCampaign(t, editor);
    await editor.mutation(api.newsletter.sendCampaign, {
      campaignId: id,
      waveSize: 2,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('sent');
  });

  it('refuses a bad wave size, waves on the newsletter, and releasing what is not held', async () => {
    fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 2);
    const id = await circleCampaign(t, editor);
    for (const waveSize of [0, -1, 1.5, 10_001]) {
      await expect(
        editor.mutation(api.newsletter.sendCampaign, {
          campaignId: id,
          waveSize,
        }),
      ).rejects.toThrow(/INVALID_WAVE_SIZE/);
    }
    const news = await editor.mutation(api.newsletter.createCampaign, {
      subject: 'La lettre',
      body: 'Les travaux du réseau.',
    });
    await expect(
      editor.mutation(api.newsletter.sendCampaign, {
        campaignId: news,
        waveSize: 5,
      }),
    ).rejects.toThrow(/WAVES_NOT_AVAILABLE/);
    await expect(
      editor.mutation(api.newsletter.releaseNextWave, {
        campaignId: id,
        size: 5,
      }),
    ).rejects.toThrow(/NOT_PAUSED/);
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('draft');
  });

  it('only an editor releases a wave', async () => {
    vi.useFakeTimers();
    fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 4);
    const id = await circleCampaign(t, editor);
    await editor.mutation(api.newsletter.sendCampaign, {
      campaignId: id,
      waveSize: 2,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const member = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'm@dt.test', role: 'membre' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${member}|s` })
        .mutation(api.newsletter.releaseNextWave, {
          campaignId: id,
          size: 2,
        }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.newsletter.releaseNextWave, { campaignId: id, size: 2 }),
    ).rejects.toThrow();
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('paused');
  });
});

describe('Waves — failure tracking and retry', () => {
  it('names who failed and why, then retries only them, without a duplicate', async () => {
    vi.useFakeTimers();
    // Two permanent refusals (the first batch of 2 fails, the second succeeds,
    // the third succeeds): 5 contacts → batches [2,2,1].
    const calls = fakeResend([403, 'ok', 'ok']);
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 5);
    const id = await circleCampaign(t, editor);
    await editor.mutation(api.newsletter.sendCampaign, { campaignId: id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: 'sent',
      recipientCount: 3,
      failedCount: 2,
    });
    const reasons = await editor.query(api.newsletter.campaignFailures, {
      campaignId: id,
    });
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({ count: 2 });
    expect(reasons[0].error).toContain('403');
    const failed = await editor.query(api.newsletter.campaignFailedRecipients, {
      campaignId: id,
    });
    expect(failed.map((f) => f.email).sort()).toEqual([
      'ami1@dt.test',
      'ami2@dt.test',
    ]);

    calls.length = 0;
    await editor.mutation(api.newsletter.retryFailedDeliveries, {
      campaignId: id,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    // Only the two that failed, once each.
    expect(sentTo(calls).sort()).toEqual(['ami1@dt.test', 'ami2@dt.test']);
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: 'sent',
      recipientCount: 5,
      failedCount: 0,
    });
    expect(
      await editor.query(api.newsletter.campaignFailedRecipients, {
        campaignId: id,
      }),
    ).toEqual([]);
  });

  it('a provider outage is resumed with the same idempotency key', async () => {
    vi.useFakeTimers();
    const calls = fakeResend(['down']);
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 2);
    const id = await circleCampaign(t, editor);
    await editor.mutation(api.newsletter.sendCampaign, { campaignId: id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const batches = batchCalls(calls);
    expect(batches).toHaveLength(2);
    expect(batches[0].key).toBe(batches[1].key);
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: 'sent',
      recipientCount: 2,
    });
  });

  it('the failed-recipients list is for editors only', async () => {
    fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 1);
    const id = await circleCampaign(t, editor);
    const member = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'm@dt.test', role: 'membre' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${member}|s` })
        .query(api.newsletter.campaignFailedRecipients, {
          campaignId: id,
        }),
    ).rejects.toThrow();
  });

  it('retrying a Cercle send is refused while the sender identity is a placeholder', async () => {
    vi.useFakeTimers();
    fakeResend([403]);
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 2);
    const id = await circleCampaign(t, editor);
    await editor.mutation(api.newsletter.sendCampaign, { campaignId: id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.unstubAllEnvs();
    fakeResend([], false);
    await expect(
      editor.mutation(api.newsletter.retryFailedDeliveries, { campaignId: id }),
    ).rejects.toThrow(/SENDER_IDENTITY_MISSING/);
  });
});

describe('Waves — the internal test comes first', () => {
  async function staff(
    t: T,
    label: string,
    role: 'moderateur' | 'admin' | 'membre' = 'moderateur',
  ) {
    await t.run((ctx) =>
      ctx.db.insert('users', { email: `delivered+${label}@resend.dev`, role }),
    );
    return `delivered+${label}@resend.dev`;
  }

  it('sends every version to each of a few team addresses, marked [TEST], with a dummy unsubscribe', async () => {
    vi.useFakeTimers();
    const calls = fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 3);
    const id = await editor.mutation(api.newsletter.createCampaign, {
      subject: 'Nouvelles du Cercle',
      body: 'Quelques nouvelles.',
      audience: 'cercle',
    });
    await editor.mutation(api.newsletter.upsertCampaignVariant, {
      campaignId: id,
      locale: 'en',
      subject: 'News from the Circle',
      body: 'Some news.',
    });
    const a = await staff(t, 'a');
    const b = await staff(t, 'b', 'admin');
    // One mutation sends to several addresses; the e-mails go out one by one.
    const result = await editor.mutation(api.newsletter.sendTestCampaign, {
      campaignId: id,
      to: [a, b, a.toUpperCase()],
    });
    expect(result).toMatchObject({ ok: true, versions: 2 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const mails = calls.flatMap((c) => c.emails);
    // 2 addresses (deduplicated) × 2 versions.
    expect(mails).toHaveLength(4);
    expect(new Set(mails.flatMap((m) => m.to))).toEqual(new Set([a, b]));
    for (const m of mails) {
      expect(m.subject).toMatch(/^\[TEST\]/);
      expect(m.html).toContain('/cercle/desinscription?token=test');
      expect(m.html).toContain('Association Fictive');
    }
    // Nothing was enqueued, nothing sent to the list.
    expect(sentTo(calls)).toHaveLength(0);
    expect(
      await t.run((ctx) => ctx.db.query('newsletterDeliveries').collect()),
    ).toHaveLength(0);
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('draft');
    expect((await t.run((ctx) => ctx.db.get(id)))?.lastTestAt).toBeTypeOf(
      'number',
    );
  });

  it('refuses an address that is not a team account, and does not say whether it has an account', async () => {
    fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 1);
    const id = await editor.mutation(api.newsletter.createCampaign, {
      subject: 'Nouvelles du Cercle',
      body: 'Quelques nouvelles.',
      audience: 'cercle',
    });
    const member = await staff(t, 'member', 'membre');
    const suspended = await staff(t, 'susp');
    await t.run(async (ctx) => {
      const u = await ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', suspended))
        .first();
      await ctx.db.patch(u!._id, { suspendedAt: 1, suspensionReason: 't' });
    });
    for (const to of [member, suspended, 'nobody@dt.test']) {
      await expect(
        editor.mutation(api.newsletter.sendTestCampaign, {
          campaignId: id,
          to: [to],
        }),
      ).rejects.toThrow(/NOT_INTERNAL_ADDRESS/);
    }
    await expect(
      editor.mutation(api.newsletter.sendTestCampaign, {
        campaignId: id,
        to: ['pas-une-adresse'],
      }),
    ).rejects.toThrow(/INVALID_EMAIL/);
    await expect(
      editor.mutation(api.newsletter.sendTestCampaign, {
        campaignId: id,
        to: [],
      }),
    ).rejects.toThrow(/NO_TEST_RECIPIENT/);
    const many = await Promise.all(
      Array.from({ length: INTERNAL_TEST_MAX + 1 }, (_, i) =>
        staff(t, `m${i}`),
      ),
    );
    await expect(
      editor.mutation(api.newsletter.sendTestCampaign, {
        campaignId: id,
        to: many,
      }),
    ).rejects.toThrow(/TOO_MANY_TEST_RECIPIENTS/);
    // None of the refusals stamped a test.
    expect((await t.run((ctx) => ctx.db.get(id)))?.lastTestAt).toBeUndefined();
  });

  it('still tests to the editor alone when no address is named (as before)', async () => {
    vi.useFakeTimers();
    const calls = fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 1);
    const id = await editor.mutation(api.newsletter.createCampaign, {
      subject: 'La lettre',
      body: 'Les travaux du réseau.',
    });
    expect(
      await editor.mutation(api.newsletter.sendTestCampaign, {
        campaignId: id,
      }),
    ).toMatchObject({
      to: 'ed@dt.test',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls.flatMap((c) => c.emails.flatMap((m) => m.to))).toEqual([
      'ed@dt.test',
    ]);
  });

  it('a Cercle campaign cannot go to its list without a test, nor with a stale one', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 13, 10, 0, 0));
    fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 2);
    const id = await editor.mutation(api.newsletter.createCampaign, {
      subject: 'Nouvelles du Cercle',
      body: 'Quelques nouvelles.',
      audience: 'cercle',
    });
    const [needs] = await editor.query(api.newsletter.listCampaigns, {
      audience: 'cercle',
    });
    expect(needs.needsTest).toBe(true);
    await expect(
      editor.mutation(api.newsletter.sendCampaign, { campaignId: id }),
    ).rejects.toThrow(/TEST_REQUIRED/);

    const person = await staff(t, 'a');
    vi.setSystemTime(Date.UTC(2026, 10, 13, 10, 5, 0));
    await editor.mutation(api.newsletter.sendTestCampaign, {
      campaignId: id,
      to: [person],
    });
    expect(
      (
        await editor.query(api.newsletter.listCampaigns, { audience: 'cercle' })
      )[0].needsTest,
    ).toBe(false);

    // The content changes after the test: the version tested is no longer the one to send.
    vi.setSystemTime(Date.UTC(2026, 10, 13, 10, 10, 0));
    await editor.mutation(api.newsletter.upsertCampaignVariant, {
      campaignId: id,
      locale: 'en',
      subject: 'News from the Circle',
      body: 'Some news.',
    });
    expect(
      (
        await editor.query(api.newsletter.listCampaigns, { audience: 'cercle' })
      )[0].needsTest,
    ).toBe(true);
    await expect(
      editor.mutation(api.newsletter.sendCampaign, { campaignId: id }),
    ).rejects.toThrow(/TEST_REQUIRED/);

    // A new test after the change lifts it.
    vi.setSystemTime(Date.UTC(2026, 10, 13, 10, 15, 0));
    await editor.mutation(api.newsletter.sendTestCampaign, {
      campaignId: id,
      to: [person],
    });
    await expect(
      editor.mutation(api.newsletter.sendCampaign, { campaignId: id }),
    ).resolves.toEqual({ ok: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('the newsletter keeps its own rule: no test required', async () => {
    vi.useFakeTimers();
    fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seedList(t, 0);
    const id = await editor.mutation(api.newsletter.createCampaign, {
      subject: 'La lettre',
      body: 'Les travaux du réseau.',
    });
    await expect(
      editor.mutation(api.newsletter.sendCampaign, { campaignId: id }),
    ).resolves.toEqual({ ok: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});

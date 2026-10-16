// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { idempotencyKey } from './lib/newsletterDelivery';

// BULK SENDING OF A CAMPAIGN (F-65, diffusion workstream).
//
// The provider (Resend) is simulated by a substitute `fetch` that
// records each request: recipients, headers, idempotency key.
// That is what lets us assert "each confirmed subscriber receives exactly one
// e-mail", including after an outage.

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

type BatchEmail = {
  to: string[];
  subject: string;
  html: string;
  headers?: Record<string, string>;
};
type Call = { url: string; key: string | null; emails: BatchEmail[] };

/**
 * Simulated Resend. `plan` says, call by call, what the provider answers:
 * 'ok', 'down' (network down: transient failure) or an HTTP status code.
 */
function fakeResend(plan: Array<'ok' | 'down' | number> = []) {
  const calls: Call[] = [];
  vi.stubEnv('AUTH_RESEND_KEY', 're_test');
  vi.stubEnv('AUTH_EMAIL_PROVIDER', 'resend');
  vi.stubEnv('SITE_URL', 'https://dt.test');
  vi.stubEnv('CONVEX_SITE_URL', 'https://api.dt.test');
  vi.stubEnv('NEWSLETTER_BATCH_SIZE', '2');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (
        url: string,
        init: { body: string; headers: Record<string, string> },
      ) => {
        const step = plan.shift() ?? 'ok';
        const body = JSON.parse(init.body) as BatchEmail | BatchEmail[];
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

async function seed(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const mk = (
      email: string,
      status: 'confirmed' | 'pending' | undefined,
      locale?: 'fr' | 'en' | 'ar',
    ) =>
      ctx.db.insert('newsletterSubscriptions', {
        email,
        locale,
        unsubToken: email.replace(/\W/g, '').slice(0, 32).padEnd(32, '0'),
        createdAt: 0,
        ...(status ? { status } : {}),
      });
    await mk('fr1@dt.test', 'confirmed', 'fr');
    await mk('en1@dt.test', 'confirmed', 'en');
    await mk('ar1@dt.test', 'confirmed', 'ar');
    await mk('attente@dt.test', 'pending', 'fr');
    await mk('herite@dt.test', undefined, 'fr');
    const editor = await ctx.db.insert('users', {
      role: 'editeur',
      email: 'ed@dt.test',
    });
    return editor;
  });
}

function recipients(calls: Call[]) {
  return calls.flatMap((c) => c.emails.flatMap((e) => e.to));
}

async function draft(
  t: TestConvex<typeof schema>,
  editor: Id<'users'>,
): Promise<Id<'newsletterCampaigns'>> {
  const ed = t.withIdentity({ subject: `${editor}|s` });
  const id = await ed.mutation(api.newsletter.createCampaign, {
    subject: 'Lettre de septembre',
    body: 'Les travaux du réseau ce mois-ci.',
    locale: 'fr',
  });
  await ed.mutation(api.newsletter.upsertCampaignVariant, {
    campaignId: id,
    locale: 'en',
    subject: 'September letter',
    body: 'The network’s work this month.',
  });
  return id;
}

describe('Campagne — destinataires, lots et en-têtes', () => {
  it('seuls les CONFIRMÉS reçoivent, par lots, dans leur langue (repli), avec List-Unsubscribe one-click', async () => {
    vi.useFakeTimers();
    const calls = fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seed(t);
    const id = await draft(t, editor);

    await t
      .withIdentity({ subject: `${editor}|s` })
      .mutation(api.newsletter.sendCampaign, { campaignId: id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Batch API, batches of 2 (NEWSLETTER_BATCH_SIZE): 3 confirmed -> 2 calls.
    expect(calls.every((c) => c.url.endsWith('/emails/batch'))).toBe(true);
    expect(calls.map((c) => c.emails.length)).toEqual([2, 1]);
    expect(recipients(calls).sort()).toEqual([
      'ar1@dt.test',
      'en1@dt.test',
      'fr1@dt.test',
    ]);

    const byTo = new Map(
      calls.flatMap((c) => c.emails).map((e) => [e.to[0], e]),
    );
    // Per-language version: the English speaker reads the translation; the Arabic
    // speaker, with no Arabic version, gets the reference version (fallback).
    expect(byTo.get('en1@dt.test')?.subject).toBe('September letter');
    expect(byTo.get('ar1@dt.test')?.subject).toBe('Lettre de septembre');
    // Unsubscribe headers in EVERY send.
    for (const e of byTo.values()) {
      expect(e.headers?.['List-Unsubscribe']).toMatch(
        /^<https:\/\/api\.dt\.test\/newsletter\/unsubscribe\?token=[0-9a-z]{32}&l=(fr|en)>$/,
      );
      expect(e.headers?.['List-Unsubscribe-Post']).toBe(
        'List-Unsubscribe=One-Click',
      );
      expect(e.html).toContain('/newsletter/desinscription?token=');
    }
    // Each batch carries its idempotency key.
    expect(calls.every((c) => c.key?.startsWith('dt-newsletter:'))).toBe(true);

    const done = await t.run((ctx) => ctx.db.get(id));
    expect(done).toMatchObject({
      status: 'sent',
      totalCount: 3,
      recipientCount: 3,
      failedCount: 0,
    });
    const rows = await t.run((ctx) =>
      ctx.db.query('newsletterDeliveries').collect(),
    );
    expect(rows.map((r) => r.status)).toEqual(['sent', 'sent', 'sent']);
  });

  it('un abonné désinscrit pendant l’envoi n’est pas servi (skipped)', async () => {
    vi.useFakeTimers();
    const calls = fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seed(t);
    const id = await draft(t, editor);
    await t.run((ctx) => ctx.db.patch(id, { status: 'sending' }));
    await t.mutation(internal.newsletter._enqueue, {
      campaignId: id,
      cursor: null,
    });
    // Unsubscribe AFTER enqueueing, BEFORE sending.
    await t.mutation(api.newsletter.unsubscribe, {
      token: 'en1dttest'.padEnd(32, '0'),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(recipients(calls)).not.toContain('en1@dt.test');
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: 'sent',
      recipientCount: 2,
      skippedCount: 1,
    });
  });

  it('refuse l’envoi à qui n’est pas éditeur', async () => {
    const t = convexTest(schema, modules);
    const editor = await seed(t);
    const id = await draft(t, editor);
    const membre = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'm@dt.test' }),
    );
    const asMembre = t.withIdentity({ subject: `${membre}|s` });
    await expect(
      asMembre.mutation(api.newsletter.sendCampaign, { campaignId: id }),
    ).rejects.toThrow();
    await expect(
      asMembre.mutation(api.newsletter.retryFailedDeliveries, {
        campaignId: id,
      }),
    ).rejects.toThrow();
    await expect(
      asMembre.mutation(api.newsletter.sendTestCampaign, { campaignId: id }),
    ).rejects.toThrow();
  });
});

describe('Campagne — reprise sans double envoi', () => {
  it('coupure réseau : le lot est REJOUÉ avec la même clé d’idempotence, et chacun reçoit une fois', async () => {
    vi.useFakeTimers();
    // First call: network down (we don't know whether it went out). Then OK.
    const calls = fakeResend(['down', 'ok', 'ok']);
    const t = convexTest(schema, modules);
    const editor = await seed(t);
    const id = await draft(t, editor);
    await t
      .withIdentity({ subject: `${editor}|s` })
      .mutation(api.newsletter.sendCampaign, { campaignId: id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // The interrupted batch and its retry: same recipients, SAME key.
    expect(calls[0].key).toBe(calls[1].key);
    expect(calls[0].emails.map((e) => e.to[0])).toEqual(
      calls[1].emails.map((e) => e.to[0]),
    );
    // Database side: each recipient is "sent" once and only once.
    const rows = await t.run((ctx) =>
      ctx.db.query('newsletterDeliveries').collect(),
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === 'sent')).toBe(true);
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: 'sent',
      recipientCount: 3,
      failedCount: 0,
    });
  });

  it('action interrompue après la prise en charge : le lot est repris au-delà du bail, même clé', async () => {
    vi.useFakeTimers();
    const calls = fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seed(t);
    const id = await draft(t, editor);
    await t.run((ctx) => ctx.db.patch(id, { status: 'sending' }));
    // Enqueue WITHOUT delivery (we keep control over the batches).
    await t.run(async (ctx) => {
      const subs = await ctx.db
        .query('newsletterSubscriptions')
        .withIndex('by_status_and_expiry', (q) => q.eq('status', 'confirmed'))
        .collect();
      for (const s of subs) {
        await ctx.db.insert('newsletterDeliveries', {
          campaignId: id,
          subscriptionId: s._id,
          status: 'queued',
          attempts: 0,
          locale: s.locale,
        });
      }
      await ctx.db.patch(id, { totalCount: subs.length, enqueueDone: true });
    });
    // A batch is CLAIMED… then the action "dies" before any call.
    const claim = await t.mutation(internal.newsletter._claimBatch, {
      campaignId: id,
      batchSize: 2,
    });
    expect(claim.kind).toBe('batch');
    const claimId = claim.kind === 'batch' ? claim.claimId : '';

    // Replaying the enqueue creates no duplicate (idempotency).
    await t.mutation(internal.newsletter._enqueue, {
      campaignId: id,
      cursor: null,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(
      await t.run((ctx) => ctx.db.query('newsletterDeliveries').collect()),
    ).toHaveLength(3);
    // The orphaned batch is resumed with ITS key.
    expect(calls.map((c) => c.key)).toContain(idempotencyKey(claimId));
    const all = recipients(calls);
    expect(all.sort()).toEqual(['ar1@dt.test', 'en1@dt.test', 'fr1@dt.test']);
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: 'sent',
      recipientCount: 3,
    });
  });

  it('refus définitif puis relance : seuls les échecs repartent, aucun doublon', async () => {
    vi.useFakeTimers();
    // First batch rejected (422), second batch accepted; then the retry goes through.
    const calls = fakeResend([422, 'ok', 'ok']);
    const t = convexTest(schema, modules);
    const editor = await seed(t);
    const id = await draft(t, editor);
    const ed = t.withIdentity({ subject: `${editor}|s` });
    await ed.mutation(api.newsletter.sendCampaign, { campaignId: id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const apres = await t.run((ctx) => ctx.db.get(id));
    expect(apres).toMatchObject({
      status: 'sent',
      recipientCount: 1,
      failedCount: 2,
    });
    const echecs = await ed.query(api.newsletter.campaignFailures, {
      campaignId: id,
    });
    expect(echecs[0]).toMatchObject({ count: 2 });
    expect(echecs[0].error).toContain('422');

    const dejaServi = recipients(calls.slice(1));
    await ed.mutation(api.newsletter.retryFailedDeliveries, { campaignId: id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const relance = recipients(calls.slice(2));
    // The retry does NOT touch the recipient already served.
    for (const r of dejaServi) expect(relance).not.toContain(r);
    expect(relance).toHaveLength(2);
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: 'sent',
      recipientCount: 3,
      failedCount: 0,
    });
  });

  it('trois échecs transitoires d’affilée : le lot passe en échec, la campagne se termine', async () => {
    vi.useFakeTimers();
    fakeResend(['down', 'down', 'down', 'ok']);
    vi.stubEnv('NEWSLETTER_BATCH_SIZE', '10');
    const t = convexTest(schema, modules);
    const editor = await seed(t);
    const id = await draft(t, editor);
    await t
      .withIdentity({ subject: `${editor}|s` })
      .mutation(api.newsletter.sendCampaign, { campaignId: id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: 'error',
      recipientCount: 0,
      failedCount: 3,
    });
  });
});

describe('Campagne — envoi de test et versions', () => {
  it('envoie TOUTES les versions à l’éditeur lui-même, sans toucher au brouillon', async () => {
    vi.useFakeTimers();
    const calls = fakeResend();
    const t = convexTest(schema, modules);
    const editor = await seed(t);
    const id = await draft(t, editor);
    const r = await t
      .withIdentity({ subject: `${editor}|s` })
      .mutation(api.newsletter.sendTestCampaign, { campaignId: id });
    expect(r).toEqual({ ok: true, to: 'ed@dt.test', versions: 2 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(recipients(calls)).toEqual(['ed@dt.test', 'ed@dt.test']);
    expect(calls.map((c) => c.emails[0].subject).sort()).toEqual([
      '[TEST] Lettre de septembre',
      '[TEST] September letter',
    ]);
    const c = await t.run((ctx) => ctx.db.get(id));
    expect(c?.status).toBe('draft');
    expect(c?.lastTestAt).toBeGreaterThan(0);
  });

  it('refuse l’envoi de test sans fournisseur, et une « variante » dans la langue de référence', async () => {
    const t = convexTest(schema, modules);
    const editor = await seed(t);
    const ed = t.withIdentity({ subject: `${editor}|s` });
    const id = await ed.mutation(api.newsletter.createCampaign, {
      subject: 'Sujet',
      body: 'Un corps assez long.',
    });
    await expect(
      ed.mutation(api.newsletter.sendTestCampaign, { campaignId: id }),
    ).rejects.toThrow('EMAIL_PROVIDER_NOT_CONFIGURED');
    await expect(
      ed.mutation(api.newsletter.upsertCampaignVariant, {
        campaignId: id,
        locale: 'fr',
        subject: 'Sujet',
        body: 'Un corps assez long.',
      }),
    ).rejects.toThrow('VARIANT_IS_REFERENCE');
    await ed.mutation(api.newsletter.upsertCampaignVariant, {
      campaignId: id,
      locale: 'ar',
      subject: 'موضوع',
      body: 'نص طويل بما فيه الكفاية.',
    });
    await ed.mutation(api.newsletter.removeCampaignVariant, {
      campaignId: id,
      locale: 'ar',
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.variants).toEqual([]);
  });
});

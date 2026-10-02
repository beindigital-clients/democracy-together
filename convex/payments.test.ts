// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { hmacSha256Hex } from './lib/payments/crypto';
import { FAKE_SIGNATURE_HEADER, signFakePayload } from './lib/payments/fake';
import { fakeProviderState } from './lib/payments/config';
import { verifyStripeSignature } from './lib/payments/stripe';

// PAYMENTS — webhooks, idempotency, fake provider guard, bounds.
//
// Each webhook goes through `handleWebhook`, which calls the SAME function as the
// HTTP route (`processWebhook`): only the reading of the HTTP request is not
// exercised here, because convex-test does not load `http.ts` (TESTING.md).

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

const STRIPE_SECRET = 'whsec_test_secret';

// Starting state: a deployment WITHOUT any payment configuration.
// Each test sets what it needs.
const PAYMENT_ENV = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'PAYMENTS_FAKE_PROVIDER',
  'PAYMENTS_FAKE_WEBHOOK_SECRET',
  'AUTH_DEV_OTP',
  'RECAPTCHA_DISABLED',
  'AUTH_RESEND_KEY',
  'AUTH_EMAIL_PROVIDER',
];

beforeEach(() => {
  for (const k of PAYMENT_ENV) vi.stubEnv(k, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function enableStripe() {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', STRIPE_SECRET);
}
function enableFake() {
  vi.stubEnv('PAYMENTS_FAKE_PROVIDER', '1');
  vi.stubEnv('AUTH_DEV_OTP', 'true');
}

type T = TestConvex<typeof schema>;

async function insertCheckout(
  t: T,
  over: Partial<{
    ref: string;
    provider: 'stripe' | 'fake';
    currency: 'EUR' | 'USD';
    amountMinor: number;
    recurring: boolean;
    userId: Id<'users'>;
  }> = {},
) {
  const ref = over.ref ?? 'ref_' + Math.random().toString(16).slice(2);
  await t.run((ctx) =>
    ctx.db.insert('paymentCheckouts', {
      ref,
      provider: over.provider ?? 'stripe',
      purpose: 'donation',
      currency: over.currency ?? 'EUR',
      amountMinor: over.amountMinor ?? 5000,
      recurring: over.recurring ?? false,
      status: 'open',
      ...(over.userId ? { userId: over.userId } : {}),
      email: 'donatrice@exemple.org',
      name: 'Awa Diop',
      anonymous: false,
      locale: 'fr',
      createdAt: Date.now(),
    }),
  );
  return ref;
}

async function stripeHeader(
  body: string,
  secret = STRIPE_SECRET,
  at = Date.now(),
) {
  const t = Math.floor(at / 1000);
  return `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${body}`)}`;
}

function sessionCompleted(ref: string, over: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: over.eventId ?? 'evt_1',
    type: over.type ?? 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: over.sessionId ?? 'cs_test_1',
        object: 'checkout.session',
        mode: 'payment',
        status: 'complete',
        payment_status: 'paid',
        client_reference_id: ref,
        amount_total: over.amount ?? 5000,
        currency: over.currency ?? 'eur',
        payment_intent: 'pi_1',
      },
    },
  });
}

const count = (
  t: T,
  table: 'paymentTransactions' | 'paymentReceipts' | 'donations',
) => t.run(async (ctx) => (await ctx.db.query(table).collect()).length);

describe('Webhook Stripe — signature HMAC', () => {
  it('refuse une signature invalide, sans rien écrire', async () => {
    enableStripe();
    const t = convexTest(schema, modules);
    const ref = await insertCheckout(t);
    const body = sessionCompleted(ref);
    const res = await t.action(internal.payments.webhooks.handleWebhook, {
      provider: 'stripe',
      rawBody: body,
      headers: { 'Stripe-Signature': await stripeHeader(body, 'whsec_AUTRE') },
    });
    expect(res.status).toBe(400);
    expect(await count(t, 'paymentTransactions')).toBe(0);
    expect(
      await t.run((ctx) => ctx.db.query('paymentWebhookEvents').collect()),
    ).toHaveLength(0);
  });

  it('refuse un corps modifié après signature, un en-tête absent, un horodatage trop ancien', async () => {
    enableStripe();
    const t = convexTest(schema, modules);
    const ref = await insertCheckout(t);
    const body = sessionCompleted(ref);
    const header = await stripeHeader(body);
    const tampered = body.replace('"amount_total":5000', '"amount_total":1');
    for (const [raw, headers] of [
      [tampered, { 'stripe-signature': header }],
      [body, {}],
      [
        body,
        {
          'stripe-signature': await stripeHeader(
            body,
            STRIPE_SECRET,
            Date.now() - 10 * 60_000,
          ),
        },
      ],
    ] as const) {
      const res = await t.action(internal.payments.webhooks.handleWebhook, {
        provider: 'stripe',
        rawBody: raw,
        headers: { ...headers },
      });
      expect(res.status).toBe(400);
    }
    expect(await count(t, 'paymentTransactions')).toBe(0);
  });

  it('vérification pure : accepte v1 parmi plusieurs signatures (rotation de secret)', async () => {
    const body = '{"a":1}';
    const now = Date.now();
    const ts = Math.floor(now / 1000);
    const good = await hmacSha256Hex(STRIPE_SECRET, `${ts}.${body}`);
    const ok = await verifyStripeSignature(
      body,
      `t=${ts},v1=deadbeef,v1=${good}`,
      STRIPE_SECRET,
      now,
    );
    expect(ok.ok).toBe(true);
    const ko = await verifyStripeSignature(
      body,
      `t=${ts},v0=${good}`,
      STRIPE_SECRET,
      now,
    );
    expect(ko.ok).toBe(false);
  });

  it('sans prestataire configuré, la route répond 404 et n’écrit rien', async () => {
    const t = convexTest(schema, modules);
    const ref = await insertCheckout(t);
    const body = sessionCompleted(ref);
    const res = await t.action(internal.payments.webhooks.handleWebhook, {
      provider: 'stripe',
      rawBody: body,
      headers: { 'stripe-signature': await stripeHeader(body) },
    });
    expect(res.status).toBe(404);
  });
});

describe('Webhook — idempotence', () => {
  it('un webhook rejoué ne crée jamais un second paiement ni un second reçu', async () => {
    enableStripe();
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const ref = await insertCheckout(t);
    const body = sessionCompleted(ref);
    const headers = { 'stripe-signature': await stripeHeader(body) };

    for (let i = 0; i < 3; i++) {
      const res = await t.action(internal.payments.webhooks.handleWebhook, {
        provider: 'stripe',
        rawBody: body,
        headers,
      });
      expect(res.status).toBe(200);
    }
    expect(await count(t, 'paymentTransactions')).toBe(1);
    expect(await count(t, 'paymentReceipts')).toBe(1);
    expect(await count(t, 'donations')).toBe(1);

    // ANOTHER event (different id) describing the SAME payment: the event
    // net does not stop it, the idempotency index does.
    const other = sessionCompleted(ref, {
      eventId: 'evt_2',
      type: 'checkout.session.async_payment_succeeded',
    });
    const res = await t.action(internal.payments.webhooks.handleWebhook, {
      provider: 'stripe',
      rawBody: other,
      headers: { 'stripe-signature': await stripeHeader(other) },
    });
    expect(res.status).toBe(200);
    expect(await count(t, 'paymentTransactions')).toBe(1);

    const totals = await t.run((ctx) =>
      ctx.db.query('paymentMonthlyTotals').collect(),
    );
    expect(totals).toHaveLength(1);
    expect(totals[0]).toMatchObject({
      grossMinor: 5000,
      count: 1,
      kind: 'donation',
      currency: 'EUR',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('un montant encaissé différent du montant demandé n’ouvre ni don ni reçu', async () => {
    enableStripe();
    const t = convexTest(schema, modules);
    const ref = await insertCheckout(t, { amountMinor: 5000 });
    const body = sessionCompleted(ref, { amount: 500 });
    const res = await t.action(internal.payments.webhooks.handleWebhook, {
      provider: 'stripe',
      rawBody: body,
      headers: { 'stripe-signature': await stripeHeader(body) },
    });
    expect(res.status).toBe(200);
    expect(await count(t, 'paymentTransactions')).toBe(0);
    expect(await count(t, 'paymentReceipts')).toBe(0);
  });

  it('abonnement Stripe : la facture mensuelle retrouve la demande par les métadonnées, chaque facture une seule fois', async () => {
    enableStripe();
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const ref = await insertCheckout(t, { recurring: true, amountMinor: 1500 });
    const invoice = (id: string, eventId: string) =>
      JSON.stringify({
        id: eventId,
        type: 'invoice.paid',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id,
            object: 'invoice',
            amount_paid: 1500,
            currency: 'eur',
            // 2025 API shape: the subscription under `parent`.
            parent: {
              subscription_details: {
                subscription: 'sub_1',
                metadata: { checkoutRef: ref },
              },
            },
          },
        },
      });
    for (const [inv, evt] of [
      ['in_1', 'evt_a'],
      ['in_1', 'evt_b'],
      ['in_2', 'evt_c'],
    ]) {
      const body = invoice(inv, evt);
      await t.action(internal.payments.webhooks.handleWebhook, {
        provider: 'stripe',
        rawBody: body,
        headers: { 'stripe-signature': await stripeHeader(body) },
      });
    }
    const txs = await t.run((ctx) =>
      ctx.db.query('paymentTransactions').collect(),
    );
    expect(txs.map((x) => x.providerPaymentId).sort()).toEqual([
      'in_1',
      'in_2',
    ]);
    const subs = await t.run((ctx) =>
      ctx.db.query('paymentSubscriptions').collect(),
    );
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({
      mode: 'native',
      providerSubscriptionId: 'sub_1',
      status: 'active',
    });
    const donations = await t.run((ctx) => ctx.db.query('donations').collect());
    expect(donations).toHaveLength(1);
    expect(donations[0]).toMatchObject({ kind: 'monthly', status: 'active' });

    // Subscription ended on the Stripe side.
    const deleted = JSON.stringify({
      id: 'evt_del',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', object: 'subscription' } },
    });
    await t.action(internal.payments.webhooks.handleWebhook, {
      provider: 'stripe',
      rawBody: deleted,
      headers: { 'stripe-signature': await stripeHeader(deleted) },
    });
    const after = await t.run((ctx) => ctx.db.get(subs[0]._id));
    expect(after?.status).toBe('cancelled');
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('charge.refunded après un remboursement marqué : décompté une seule fois', async () => {
    enableStripe();
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const ref = await insertCheckout(t);
    const body = sessionCompleted(ref);
    await t.action(internal.payments.webhooks.handleWebhook, {
      provider: 'stripe',
      rawBody: body,
      headers: { 'stripe-signature': await stripeHeader(body) },
    });
    const refund = JSON.stringify({
      id: 'evt_r',
      type: 'charge.refunded',
      data: { object: { id: 'ch_1', refunded: true, payment_intent: 'pi_1' } },
    });
    for (const eventId of ['evt_r', 'evt_r2']) {
      const b = refund.replace('evt_r', eventId);
      await t.action(internal.payments.webhooks.handleWebhook, {
        provider: 'stripe',
        rawBody: b,
        headers: { 'stripe-signature': await stripeHeader(b) },
      });
    }
    const [tx] = await t.run((ctx) =>
      ctx.db.query('paymentTransactions').collect(),
    );
    expect(tx.status).toBe('refunded');
    const [total] = await t.run((ctx) =>
      ctx.db.query('paymentMonthlyTotals').collect(),
    );
    expect(total.refundedMinor).toBe(5000);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});

describe('Stripe — euro et dollar sur le même compte', () => {
  it('propose les deux devises par Stripe dès que la clé est posée', async () => {
    enableStripe();
    const t = convexTest(schema, modules);
    const options = await t.query(api.payments.checkout.paymentOptions, {});
    expect(options.currencies).toEqual([
      { currency: 'EUR', provider: 'stripe', recurringMode: 'native' },
      { currency: 'USD', provider: 'stripe', recurringMode: 'native' },
    ]);
    expect(options.simulated).toBe(false);
  });

  it('ouvre la session Checkout dans la devise choisie', async () => {
    enableStripe();
    const sent: URLSearchParams[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(new URLSearchParams(init.body as string));
        return new Response(
          JSON.stringify({
            id: 'cs_usd',
            url: 'https://checkout.stripe.com/x',
          }),
          { status: 200 },
        );
      }),
    );
    vi.stubEnv('RECAPTCHA_DISABLED', 'true');
    vi.stubEnv('AUTH_DEV_OTP', 'true');
    const t = convexTest(schema, modules);
    const out = await t.action(api.payments.checkout.startDonation, {
      currency: 'USD',
      amount: 50,
      recurring: false,
      email: 'donor@example.org',
      anonymous: false,
      locale: 'en',
    });
    expect(out.redirectUrl).toBe('https://checkout.stripe.com/x');
    expect(sent).toHaveLength(1);
    expect(sent[0].get('line_items[0][price_data][currency]')).toBe('usd');
    expect(sent[0].get('line_items[0][price_data][unit_amount]')).toBe('5000');
  });

  it('inscrit un paiement en dollars ; une devise étrangère au site est ignorée', async () => {
    enableStripe();
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const ref = await insertCheckout(t, { currency: 'USD' });
    const body = sessionCompleted(ref, { currency: 'usd' });
    const res = await t.action(internal.payments.webhooks.handleWebhook, {
      provider: 'stripe',
      rawBody: body,
      headers: { 'stripe-signature': await stripeHeader(body) },
    });
    expect(res.status).toBe(200);
    const txs = await t.run((ctx) =>
      ctx.db.query('paymentTransactions').collect(),
    );
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      provider: 'stripe',
      currency: 'USD',
      amountMinor: 5000,
    });

    // Session settled in pounds sterling (misconfigured account): nothing is
    // recorded, the ledger cannot total this currency.
    const ref2 = await insertCheckout(t);
    const gbp = sessionCompleted(ref2, {
      currency: 'gbp',
      eventId: 'evt_gbp',
      sessionId: 'cs_gbp',
    });
    await t.action(internal.payments.webhooks.handleWebhook, {
      provider: 'stripe',
      rawBody: gbp,
      headers: { 'stripe-signature': await stripeHeader(gbp) },
    });
    expect(await count(t, 'paymentTransactions')).toBe(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});

describe('Prestataire factice — garde (modèle AUTH_DEV_OTP)', () => {
  async function signedFake(ref: string) {
    const body = JSON.stringify({
      id: 'fakeevt_1',
      type: 'payment.succeeded',
      ref,
      paymentId: 'fakepay_1',
      amountMinor: 5000,
      currency: 'EUR',
      paidAt: Date.now(),
    });
    return { body, signature: await signFakePayload(body) };
  }

  it('drapeau absent ou mal écrit : coupé', () => {
    expect(fakeProviderState()).toBe('off');
    for (const value of ['true', 'TRUE', 'yes', '01', ' 1']) {
      vi.stubEnv('PAYMENTS_FAKE_PROVIDER', value);
      vi.stubEnv('AUTH_DEV_OTP', 'true');
      expect(fakeProviderState()).toBe('off');
    }
  });

  it('drapeau posé sans AUTH_DEV_OTP : REFUSÉ, webhook signé refusé, simulation refusée', async () => {
    vi.stubEnv('PAYMENTS_FAKE_PROVIDER', '1');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(fakeProviderState()).toBe('refused');
    const t = convexTest(schema, modules);
    const ref = await insertCheckout(t, { provider: 'fake' });
    const { body, signature } = await signedFake(ref);
    const res = await t.action(internal.payments.webhooks.handleWebhook, {
      provider: 'fake',
      rawBody: body,
      headers: { [FAKE_SIGNATURE_HEADER]: signature },
    });
    expect(res.status).toBe(404);
    await expect(
      t.action(api.payments.fake.simulate, { ref, outcome: 'paid' }),
    ).rejects.toThrow(/FAKE_PROVIDER_DISABLED/);
    expect(await count(t, 'paymentTransactions')).toBe(0);
    expect(
      (await t.query(api.payments.checkout.paymentOptions, {})).currencies,
    ).toEqual([]);
    errors.mockRestore();
  });

  it('refusé en présence d’un indicateur de production, même avec AUTH_DEV_OTP', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    enableFake();
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_abc');
    expect(fakeProviderState()).toBe('refused');
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_live_abc');
    expect(fakeProviderState()).toBe('refused');
    errors.mockRestore();
  });

  it('actif en dev : la simulation joue le webhook signé de bout en bout', async () => {
    enableFake();
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const options = await t.query(api.payments.checkout.paymentOptions, {});
    expect(options.simulated).toBe(true);
    expect(options.currencies.map((c) => c.provider)).toEqual(['fake', 'fake']);

    const ref = await insertCheckout(t, { provider: 'fake' });
    // A forged signature is still refused, even with the guard open.
    const bad = await t.action(internal.payments.webhooks.handleWebhook, {
      provider: 'fake',
      rawBody: (await signedFake(ref)).body,
      headers: { [FAKE_SIGNATURE_HEADER]: '00'.repeat(32) },
    });
    expect(bad.status).toBe(400);

    const out = await t.action(api.payments.fake.simulate, {
      ref,
      outcome: 'paid',
    });
    expect(out.returnPath).toBe(`/fr/paiement/retour?ref=${ref}&statut=succes`);
    expect(await count(t, 'paymentTransactions')).toBe(1);
    expect(
      (await t.query(api.payments.checkout.checkoutStatus, { ref }))?.status,
    ).toBe('completed');
    // Replaying the simulation on a paid request does not pay twice.
    await t.action(api.payments.fake.simulate, { ref, outcome: 'paid' });
    expect(await count(t, 'paymentTransactions')).toBe(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});

describe('Formulaire de don — bornes et prestataire', () => {
  const base = {
    currency: 'EUR' as const,
    amount: 50,
    recurring: false,
    email: 'donatrice@exemple.org',
    anonymous: false,
    locale: 'fr' as const,
  };

  it('sans prestataire : PAYMENTS_UNAVAILABLE', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.payments.checkout.createDonationCheckout, base),
    ).rejects.toThrow(/PAYMENTS_UNAVAILABLE/);
  });

  it('refuse les montants hors bornes, dans chaque devise, et les décimales impossibles', async () => {
    enableFake();
    const t = convexTest(schema, modules);
    for (const [currency, amount] of [
      ['EUR', 4.99],
      ['EUR', 10_000.01],
      ['EUR', 0],
      ['EUR', -20],
      ['EUR', 20.001],
      ['EUR', Number.NaN],
      ['USD', 4.99],
      ['USD', 10_000.01],
      ['USD', 20.001],
    ] as const) {
      await expect(
        t.mutation(internal.payments.checkout.createDonationCheckout, {
          ...base,
          currency,
          amount,
        }),
      ).rejects.toThrow(/AMOUNT_OUT_OF_BOUNDS/);
    }
    // The bounds themselves are accepted.
    for (const [currency, amount, minor] of [
      ['EUR', 5, 500],
      ['EUR', 10_000, 1_000_000],
      ['EUR', 19.99, 1999],
      ['USD', 5, 500],
      ['USD', 10_000, 1_000_000],
    ] as const) {
      const c = await t.mutation(
        internal.payments.checkout.createDonationCheckout,
        {
          ...base,
          email: `d${amount}@exemple.org`,
          currency,
          amount,
        },
      );
      expect(c.amountMinor).toBe(minor);
    }
    await expect(
      t.mutation(internal.payments.checkout.createDonationCheckout, {
        ...base,
        email: 'pas-une-adresse',
      }),
    ).rejects.toThrow(/INVALID_EMAIL/);
    await expect(
      t.mutation(internal.payments.checkout.createDonationCheckout, {
        ...base,
        message: 'x'.repeat(501),
      }),
    ).rejects.toThrow(/INVALID_MESSAGE/);
  });

  it('plafond par adresse : RATE_LIMITED au-delà de dix demandes par heure', async () => {
    enableFake();
    const t = convexTest(schema, modules);
    for (let i = 0; i < 10; i++) {
      await t.mutation(internal.payments.checkout.createDonationCheckout, base);
    }
    await expect(
      t.mutation(internal.payments.checkout.createDonationCheckout, base),
    ).rejects.toThrow(/RATE_LIMITED/);
  });

  it('l’action publique exige reCAPTCHA (fail-closed sans clé)', async () => {
    enableFake();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.payments.checkout.startDonation, { ...base }),
    ).rejects.toThrow(/CAPTCHA_FAILED/);
    vi.stubEnv('RECAPTCHA_DISABLED', 'true');
    const out = await t.action(api.payments.checkout.startDonation, {
      ...base,
    });
    expect(out.redirectUrl).toBe(`/fr/paiement/simulateur?ref=${out.ref}`);
    expect(
      (await t.query(api.payments.checkout.checkoutStatus, { ref: out.ref }))
        ?.status,
    ).toBe('open');
    errors.mockRestore();
    warns.mockRestore();
  });
});

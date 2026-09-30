// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { NetworkRole } from './lib/roles';
import { receiptNumber } from './lib/payments/ledger';
import { MAX_REMINDERS } from './payments/recurring';

// PAYMENTS — receipts (F-29), member area (F-30), back-office (F-31),
// membership fees (F-27) and monthly donation reminders (F-28).

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

const PAYMENT_ENV = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'PAYMENTS_FAKE_WEBHOOK_SECRET',
  'AUTH_RESEND_KEY',
  'AUTH_EMAIL_PROVIDER',
  'RECAPTCHA_DISABLED',
];

// The whole suite runs with the fake provider ACTIVE: it is what plays
// the signed webhook, as in E2E.
beforeEach(() => {
  for (const k of PAYMENT_ENV) vi.stubEnv(k, undefined);
  vi.stubEnv('PAYMENTS_FAKE_PROVIDER', '1');
  vi.stubEnv('AUTH_DEV_OTP', 'true');
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type T = ReturnType<typeof convexTest>;

async function user(t: T, role: NetworkRole, email: string) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { role, email, name: email.split('@')[0] }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

async function donate(
  as: ReturnType<T['withIdentity']> | T,
  over: Partial<{
    amount: number;
    recurring: boolean;
    currency: 'EUR' | 'USD';
    email: string;
  }> = {},
) {
  const created = await as.mutation(
    internal.payments.checkout.createDonationCheckout,
    {
      currency: over.currency ?? 'EUR',
      amount: over.amount ?? 50,
      recurring: over.recurring ?? false,
      email: over.email ?? 'donateur@exemple.org',
      anonymous: true,
      locale: 'fr',
    },
  );
  await as.mutation(internal.payments.checkout.attachSession, {
    checkoutId: created.checkoutId,
    providerSessionId: `fake_${created.ref}`,
  });
  await as.action(api.payments.fake.simulate, {
    ref: created.ref,
    outcome: 'paid',
  });
  return created.ref;
}

describe('Reçus — numérotation continue', () => {
  it('numéros consécutifs, sans trou, même quand un paiement est rejeté entre deux', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await donate(t, { email: 'a@exemple.org' });
    await donate(t, { email: 'b@exemple.org' });

    // REJECTED payment (inconsistent amount): it consumes no number.
    const ref = 'rejete';
    await t.run((ctx) =>
      ctx.db.insert('paymentCheckouts', {
        ref,
        provider: 'fake',
        purpose: 'donation',
        currency: 'EUR',
        amountMinor: 5000,
        recurring: false,
        status: 'open',
        email: 'c@exemple.org',
        locale: 'fr',
        createdAt: Date.now(),
      }),
    );
    const res = await t.mutation(internal.payments.webhooks.applySyncedEvents, {
      provider: 'fake',
      events: [
        {
          kind: 'payment_succeeded',
          providerPaymentId: 'fakepay_bad',
          checkoutRef: ref,
          amountMinor: 1,
          currency: 'EUR',
          paidAt: Date.now(),
        },
      ],
    });
    expect(res).toEqual(['amount_mismatch']);

    await donate(t, { email: 'd@exemple.org' });
    const receipts = await t.run((ctx) =>
      ctx.db
        .query('paymentReceipts')
        .withIndex('by_year_and_sequence')
        .collect(),
    );
    const year = new Date().getUTCFullYear();
    expect(receipts.map((r) => r.number)).toEqual([
      receiptNumber(year, 1),
      receiptNumber(year, 2),
      receiptNumber(year, 3),
    ]);
    expect(receipts.map((r) => r.sequence)).toEqual([1, 2, 3]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('la série repart à 1 au changement d’année', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const mk = async (ref: string, paidAt: number) => {
      await t.run((ctx) =>
        ctx.db.insert('paymentCheckouts', {
          ref,
          provider: 'fake',
          purpose: 'donation',
          currency: 'EUR',
          amountMinor: 1000,
          recurring: false,
          status: 'open',
          email: 'x@exemple.org',
          locale: 'fr',
          createdAt: paidAt,
        }),
      );
      await t.mutation(internal.payments.webhooks.applySyncedEvents, {
        provider: 'fake',
        events: [
          {
            kind: 'payment_succeeded',
            providerPaymentId: `p_${ref}`,
            checkoutRef: ref,
            amountMinor: 1000,
            currency: 'EUR',
            paidAt,
          },
        ],
      });
    };
    await mk('r1', Date.UTC(2026, 11, 31, 23, 0));
    await mk('r2', Date.UTC(2027, 0, 1, 0, 30));
    await mk('r3', Date.UTC(2027, 0, 2));
    const numbers = await t.run(async (ctx) =>
      (await ctx.db.query('paymentReceipts').collect())
        .map((r) => r.number)
        .sort(),
    );
    expect(numbers).toEqual([
      'DT-2026-000001',
      'DT-2027-000001',
      'DT-2027-000002',
    ]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});

describe('Reçus — PDF et accès', () => {
  it('le PDF est produit, et seul son propriétaire (ou un admin) le télécharge', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const owner = await user(t, 'membre', 'proprio@exemple.org');
    const other = await user(t, 'membre', 'autre@exemple.org');
    const admin = await user(t, 'admin', 'admin@exemple.org');
    await donate(owner.as, { email: 'proprio@exemple.org' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [receipt] = await t.run((ctx) =>
      ctx.db.query('paymentReceipts').collect(),
    );
    expect(receipt.userId).toBe(owner.id);
    expect(receipt.storageId).toBeDefined();
    const head = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(receipt.storageId!);
      return new TextDecoder().decode((await blob!.arrayBuffer()).slice(0, 5));
    });
    expect(head).toBe('%PDF-');

    const mine = await owner.as.query(api.payments.member.receiptDownloadUrl, {
      receiptId: receipt._id,
    });
    expect(mine?.number).toBe(receipt.number);
    expect(mine?.url).toBeTruthy();

    await expect(
      other.as.query(api.payments.member.receiptDownloadUrl, {
        receiptId: receipt._id,
      }),
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      t.query(api.payments.member.receiptDownloadUrl, {
        receiptId: receipt._id,
      }),
    ).rejects.toThrow();
    expect(
      (
        await admin.as.query(api.payments.member.receiptDownloadUrl, {
          receiptId: receipt._id,
        })
      )?.number,
    ).toBe(receipt.number);

    // Email link: the exact token opens it, any other does not.
    expect(
      (
        await t.query(api.payments.member.receiptByToken, {
          token: receipt.accessToken,
        })
      )?.url,
    ).toBeTruthy();
    const forged = receipt.accessToken.replace(/.$/, (c) =>
      c === '0' ? '1' : '0',
    );
    expect(
      await t.query(api.payments.member.receiptByToken, { token: forged }),
    ).toBeNull();
    expect(
      await t.query(api.payments.member.receiptByToken, { token: 'x' }),
    ).toBeNull();

    // The other account's member area does not see this payment.
    const otherView = await other.as.query(api.payments.member.overview, {
      now: Date.now(),
    });
    expect(otherView.transactions).toHaveLength(0);
    const ownerView = await owner.as.query(api.payments.member.overview, {
      now: Date.now(),
    });
    expect(ownerView.transactions).toHaveLength(1);
    expect(ownerView.transactions[0].receipt?.ready).toBe(true);
  });
});

describe('Cotisations (F-27) — barème et période', () => {
  it('le barème est réservé à l’admin ; la cotisation au membre ; le montant vient du barème', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const admin = await user(t, 'admin', 'admin@exemple.org');
    const membre = await user(t, 'membre', 'membre@exemple.org');
    const visiteur = await user(t, 'visiteur', 'visiteur@exemple.org');

    await expect(
      membre.as.mutation(api.payments.plans.seedDefaultPlans, {}),
    ).rejects.toThrow();
    expect(
      await admin.as.mutation(api.payments.plans.seedDefaultPlans, {}),
    ).toBe(9);
    expect(
      await admin.as.mutation(api.payments.plans.seedDefaultPlans, {}),
    ).toBe(0);
    await admin.as.mutation(api.payments.plans.upsertPlan, {
      category: 'ind',
      zone: 'low',
      amountEur: 30,
      amountUsd: 35,
      active: true,
    });
    await expect(
      admin.as.mutation(api.payments.plans.upsertPlan, {
        category: 'ind',
        zone: 'low',
        amountEur: 0.5,
        amountUsd: null,
        active: true,
      }),
    ).rejects.toThrow(/AMOUNT_OUT_OF_BOUNDS/);
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toEqual([
      'payment.plans_seeded',
      'payment.plan_changed',
    ]);

    const plans = await t.query(api.payments.plans.publicPlans, {});
    expect(
      plans.find((p) => p.category === 'ind' && p.zone === 'low'),
    ).toMatchObject({
      amountEur: 3000,
      amountUsd: 3500,
    });

    await expect(
      visiteur.as.mutation(internal.payments.checkout.createDuesCheckout, {
        category: 'ind',
        zone: 'low',
        currency: 'USD',
        locale: 'fr',
      }),
    ).rejects.toThrow();

    const pay = async () => {
      const c = await membre.as.mutation(
        internal.payments.checkout.createDuesCheckout,
        {
          category: 'ind',
          zone: 'low',
          currency: 'USD',
          locale: 'fr',
        },
      );
      expect(c.amountMinor).toBe(3500);
      await t.action(api.payments.fake.simulate, {
        ref: c.ref,
        outcome: 'paid',
      });
    };
    await pay();
    const first = await membre.as.query(api.payments.member.overview, {
      now: Date.now(),
    });
    expect(first.dues).toMatchObject({
      upToDate: true,
      currency: 'USD',
      amountMinor: 3500,
    });
    const firstEnd = first.dues!.periodEnd;

    // EARLY renewal: the next period starts at the end of the
    // current period.
    await pay();
    const dues = await t.run((ctx) =>
      ctx.db
        .query('membershipDues')
        .withIndex('by_payer_and_periodEnd')
        .collect(),
    );
    expect(dues).toHaveLength(2);
    expect(dues[1].periodStart).toBe(firstEnd);

    // Overdue: seen from the back-office when the last period has lapsed.
    const later = dues[1].periodEnd + 1000;
    const late = await admin.as.query(api.payments.finances.lateDues, {
      now: later,
    });
    expect(late).toHaveLength(1);
    expect(late[0].email).toBe('membre@exemple.org');
    expect(
      await admin.as.query(api.payments.finances.lateDues, { now: Date.now() }),
    ).toHaveLength(0);
    await expect(
      membre.as.query(api.payments.finances.lateDues, { now: later }),
    ).rejects.toThrow();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('formule désactivée : PLAN_UNAVAILABLE', async () => {
    const t = convexTest(schema, modules);
    const admin = await user(t, 'admin', 'admin@exemple.org');
    await admin.as.mutation(api.payments.plans.upsertPlan, {
      category: 'org',
      zone: 'high',
      amountEur: 1200,
      amountUsd: null,
      active: false,
    });
    await expect(
      admin.as.mutation(internal.payments.checkout.createDuesCheckout, {
        category: 'org',
        zone: 'high',
        currency: 'EUR',
        locale: 'fr',
      }),
    ).rejects.toThrow(/PLAN_UNAVAILABLE/);
  });
});

describe('Back-office (F-31) — remboursement, export, journal', () => {
  it('remboursement marqué : admin seul, idempotent, audité, déduit du mois', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const admin = await user(t, 'admin', 'admin@exemple.org');
    const moderateur = await user(t, 'moderateur', 'mod@exemple.org');
    await donate(t);
    const [tx] = await t.run((ctx) =>
      ctx.db.query('paymentTransactions').collect(),
    );

    await expect(
      moderateur.as.mutation(api.payments.finances.markRefunded, {
        transactionId: tx._id,
        reason: 'Erreur de montant',
      }),
    ).rejects.toThrow();
    await expect(
      admin.as.mutation(api.payments.finances.markRefunded, {
        transactionId: tx._id,
        reason: ' ',
      }),
    ).rejects.toThrow(/INVALID_REASON/);
    expect(
      await admin.as.mutation(api.payments.finances.markRefunded, {
        transactionId: tx._id,
        reason: 'Erreur de montant',
      }),
    ).toBe(true);
    expect(
      await admin.as.mutation(api.payments.finances.markRefunded, {
        transactionId: tx._id,
        reason: 'Deuxième clic',
      }),
    ).toBe(false);

    const month = tx.month;
    const dash = await admin.as.query(api.payments.finances.dashboard, {
      fromMonth: month,
    });
    expect(dash.months[0]).toMatchObject({
      grossMinor: 5000,
      refundedMinor: 5000,
      count: 1,
    });
    expect(dash.providers.fake).toBe('active');

    const donation = await t.run((ctx) => ctx.db.get(tx.donationId!));
    expect(donation?.status).toBe('refunded');

    const exported = await admin.as.mutation(
      api.payments.finances.exportTransactions,
      {
        fromMs: 0,
        toMs: Date.now() + 1,
      },
    );
    expect(exported.rows).toHaveLength(1);
    expect(exported.rows[0]).toMatchObject({
      status: 'refunded',
      refundReason: 'Erreur de montant',
    });
    await expect(
      moderateur.as.mutation(api.payments.finances.exportTransactions, {
        fromMs: 0,
        toMs: 1,
      }),
    ).rejects.toThrow();

    const actions = await t.run(async (ctx) =>
      (await ctx.db.query('auditLog').collect()).map((a) => a.action),
    );
    expect(actions).toEqual(['payment.refunded', 'payment.exported']);

    const page = await admin.as.query(api.payments.finances.listTransactions, {
      paginationOpts: { numItems: 10, cursor: null },
      status: 'refunded',
    });
    expect(page.page).toHaveLength(1);
    expect(page.page[0].receiptNumber).toMatch(/^DT-\d{4}-000001$/);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('remboursement chez le prestataire (factice) : exécuté puis inscrit', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const admin = await user(t, 'admin', 'admin@exemple.org');
    await donate(t);
    const [tx] = await t.run((ctx) =>
      ctx.db.query('paymentTransactions').collect(),
    );
    expect(
      await admin.as.action(api.payments.finances.refundAtProvider, {
        transactionId: tx._id,
        reason: 'Demande du donateur',
      }),
    ).toBe(true);
    const after = await t.run((ctx) => ctx.db.get(tx._id));
    expect(after).toMatchObject({
      status: 'refunded',
      refundedAtProvider: true,
    });
    await expect(
      admin.as.action(api.payments.finances.refundAtProvider, {
        transactionId: tx._id,
        reason: 'Encore',
      }),
    ).rejects.toThrow(/ALREADY_REFUNDED/);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});

describe('Dons mensuels par relance (F-28, prestataire factice)', () => {
  it('échéance → lien envoyé → paiement → échéance suivante ; suspendu après trois relances sans suite', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const donor = await user(t, 'membre', 'mensuel@exemple.org');
    await donate(donor.as, {
      recurring: true,
      currency: 'USD',
      amount: 50,
      email: 'mensuel@exemple.org',
    });
    const [sub] = await t.run((ctx) =>
      ctx.db.query('paymentSubscriptions').collect(),
    );
    expect(sub).toMatchObject({
      mode: 'reminder',
      status: 'active',
      reminderCount: 0,
    });

    // Nothing is due before the due date.
    expect(
      await t.action(internal.payments.recurring.sendDueReminders, {}),
    ).toBe(0);

    // The due date arrives: a payment link goes out.
    vi.setSystemTime(sub.nextDueAt + 60_000);
    expect(
      await t.action(internal.payments.recurring.sendDueReminders, {}),
    ).toBe(1);
    // Re-running the cron the same day does not remind twice.
    expect(
      await t.action(internal.payments.recurring.sendDueReminders, {}),
    ).toBe(0);
    const renewal = await t.run(async (ctx) =>
      (await ctx.db.query('paymentCheckouts').collect()).find(
        (c) => c.subscriptionId === sub._id,
      ),
    );
    expect(renewal?.status).toBe('open');
    await t.action(api.payments.fake.simulate, {
      ref: renewal!.ref,
      outcome: 'paid',
    });
    const paid = await t.run((ctx) => ctx.db.get(sub._id));
    expect(paid?.reminderCount).toBe(0);
    expect(paid!.nextDueAt).toBeGreaterThan(sub.nextDueAt);
    const txs = await t.run((ctx) =>
      ctx.db
        .query('paymentTransactions')
        .withIndex('by_subscription', (q) => q.eq('subscriptionId', sub._id))
        .collect(),
    );
    expect(txs).toHaveLength(2);

    // Three unanswered reminders (a week apart), then suspension.
    let now = paid!.nextDueAt + 60_000;
    for (let i = 0; i < MAX_REMINDERS; i++) {
      vi.setSystemTime(now);
      expect(
        await t.action(internal.payments.recurring.sendDueReminders, {}),
      ).toBe(1);
      now += 8 * 24 * 3600_000;
    }
    vi.setSystemTime(now);
    expect(
      await t.action(internal.payments.recurring.sendDueReminders, {}),
    ).toBe(0);
    expect((await t.run((ctx) => ctx.db.get(sub._id)))?.status).toBe(
      'past_due',
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('le donateur arrête son don ; un autre compte ne le peut pas', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const donor = await user(t, 'membre', 'mensuel@exemple.org');
    const other = await user(t, 'membre', 'autre@exemple.org');
    await donate(donor.as, { recurring: true, email: 'mensuel@exemple.org' });
    const [sub] = await t.run((ctx) =>
      ctx.db.query('paymentSubscriptions').collect(),
    );
    await expect(
      other.as.mutation(api.payments.member.cancelMyRecurring, {
        subscriptionId: sub._id,
      }),
    ).rejects.toThrow(/FORBIDDEN/);
    await donor.as.mutation(api.payments.member.cancelMyRecurring, {
      subscriptionId: sub._id,
    });
    const after = await t.run((ctx) => ctx.db.get(sub._id));
    expect(after?.status).toBe('cancelled');
    const donation = await t.run((ctx) => ctx.db.get(after!.donationId!));
    expect(donation?.status).toBe('cancelled');
    // Stopped: no more reminders, even past the due date.
    vi.setSystemTime(sub.nextDueAt + 60_000);
    expect(
      await t.action(internal.payments.recurring.sendDueReminders, {}),
    ).toBe(0);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});

describe('Suppression de compte — deleteUserDataPaiements', () => {
  it('détache le compte des pièces comptables sans les supprimer, et arrête les dons mensuels', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const donor = await user(t, 'membre', 'parti@exemple.org');
    await donate(donor.as, { recurring: true, email: 'parti@exemple.org' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const { deleteUserDataPaiements } = await import('./lib/payments/ledger');
    await t.run((ctx) => deleteUserDataPaiements(ctx, donor.id));
    const [tx] = await t.run((ctx) =>
      ctx.db.query('paymentTransactions').collect(),
    );
    expect(tx.userId).toBeUndefined();
    expect(tx.amountMinor).toBe(5000);
    const [sub] = await t.run((ctx) =>
      ctx.db.query('paymentSubscriptions').collect(),
    );
    expect(sub.status).toBe('cancelled');
    expect(sub.userId).toBeUndefined();
    const [receipt] = await t.run((ctx) =>
      ctx.db.query('paymentReceipts').collect(),
    );
    expect(receipt.userId).toBeUndefined();
    expect(receipt.number).toMatch(/^DT-/);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});

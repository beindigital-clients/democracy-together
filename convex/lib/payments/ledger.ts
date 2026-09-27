import type { MutationCtx } from '../../_generated/server';
import type { Doc, Id } from '../../_generated/dataModel';
import { internal } from '../../_generated/api';
import { notify } from '../notify';
import {
  addMonthsUtc,
  fromMinor,
  MEMBERSHIP_PERIOD_MONTHS,
  monthKey,
} from './amounts';
import { randomToken } from './crypto';
import { getAdapter } from './registry';
import type { NormalizedEvent, PaymentPurpose, ProviderId } from './validators';

// LE GRAND LIVRE — seul endroit qui écrit un paiement.
//
// Tous les chemins y mènent : webhook Stripe, IPN PayDunya, webhook factice,
// relecture au retour de paiement. Chaque fonction s'exécute DANS la
// transaction de la mutation appelante : le paiement, le don ou la cotisation,
// les totaux mensuels et le numéro de reçu sont écrits ensemble ou pas du tout.

type PaymentSucceeded = Extract<NormalizedEvent, { kind: 'payment_succeeded' }>;

export type ApplyResult =
  | { status: 'recorded'; transactionId: Id<'paymentTransactions'> }
  | { status: 'duplicate'; transactionId: Id<'paymentTransactions'> }
  | {
      status:
        | 'unknown_checkout'
        | 'provider_mismatch'
        | 'amount_mismatch'
        | 'already_paid'
        | 'invalid_checkout';
    };

// --- Totaux mensuels -----------------------------------------------------------

export async function bumpMonthlyTotals(
  ctx: MutationCtx,
  key: { month: string; currency: 'EUR' | 'XOF'; kind: PaymentPurpose },
  delta: { gross?: number; refunded?: number; count?: number },
): Promise<void> {
  const row = await ctx.db
    .query('paymentMonthlyTotals')
    .withIndex('by_month_and_currency_and_kind', (q) =>
      q
        .eq('month', key.month)
        .eq('currency', key.currency)
        .eq('kind', key.kind),
    )
    .unique();
  if (!row) {
    await ctx.db.insert('paymentMonthlyTotals', {
      ...key,
      grossMinor: delta.gross ?? 0,
      refundedMinor: delta.refunded ?? 0,
      count: delta.count ?? 0,
    });
    return;
  }
  await ctx.db.patch(row._id, {
    grossMinor: row.grossMinor + (delta.gross ?? 0),
    refundedMinor: row.refundedMinor + (delta.refunded ?? 0),
    count: row.count + (delta.count ?? 0),
  });
}

// --- Reçus : numérotation continue ----------------------------------------------

export function receiptNumber(year: number, sequence: number): string {
  return `DT-${year}-${String(sequence).padStart(6, '0')}`;
}

/**
 * Attribue le numéro suivant de l'année et crée le reçu.
 *
 * SANS TROU, par construction : le compteur de l'année est lu et incrémenté
 * dans la transaction qui écrit le paiement. Deux paiements simultanés lisent
 * le même compteur, et Convex (contrôle de concurrence optimiste) rejoue l'un
 * des deux après l'autre — jamais deux fois le même numéro, jamais un numéro
 * consommé par une transaction annulée.
 */
export async function allocateReceipt(
  ctx: MutationCtx,
  args: {
    transactionId: Id<'paymentTransactions'>;
    userId?: Id<'users'>;
    email: string;
    paidAt: number;
  },
): Promise<Id<'paymentReceipts'>> {
  const year = new Date(args.paidAt).getUTCFullYear();
  const seq = await ctx.db
    .query('paymentReceiptSequences')
    .withIndex('by_year', (q) => q.eq('year', year))
    .unique();
  const sequence = (seq?.lastSequence ?? 0) + 1;
  if (seq) await ctx.db.patch(seq._id, { lastSequence: sequence });
  else
    await ctx.db.insert('paymentReceiptSequences', {
      year,
      lastSequence: sequence,
    });
  return await ctx.db.insert('paymentReceipts', {
    year,
    sequence,
    number: receiptNumber(year, sequence),
    transactionId: args.transactionId,
    ...(args.userId ? { userId: args.userId } : {}),
    email: args.email,
    accessToken: randomToken(24),
    createdAt: Date.now(),
  });
}

// --- Lecture des références ----------------------------------------------------

export async function checkoutByRef(
  ctx: MutationCtx,
  ref: string,
): Promise<Doc<'paymentCheckouts'> | null> {
  return await ctx.db
    .query('paymentCheckouts')
    .withIndex('by_ref', (q) => q.eq('ref', ref))
    .unique();
}

async function subscriptionByProviderId(
  ctx: MutationCtx,
  provider: ProviderId,
  providerSubscriptionId: string,
): Promise<Doc<'paymentSubscriptions'> | null> {
  return await ctx.db
    .query('paymentSubscriptions')
    .withIndex('by_provider_and_subscription', (q) =>
      q
        .eq('provider', provider)
        .eq('providerSubscriptionId', providerSubscriptionId),
    )
    .first();
}

async function subscriptionForCheckout(
  ctx: MutationCtx,
  checkout: Doc<'paymentCheckouts'>,
): Promise<Doc<'paymentSubscriptions'> | null> {
  if (checkout.subscriptionId) return await ctx.db.get(checkout.subscriptionId);
  return await ctx.db
    .query('paymentSubscriptions')
    .withIndex('by_checkout', (q) => q.eq('checkoutId', checkout._id))
    .first();
}

async function createSubscription(
  ctx: MutationCtx,
  checkout: Doc<'paymentCheckouts'>,
  providerSubscriptionId: string | undefined,
  startedAt: number,
): Promise<Doc<'paymentSubscriptions'>> {
  const id = await ctx.db.insert('paymentSubscriptions', {
    provider: checkout.provider,
    mode: getAdapter(checkout.provider).nativeSubscriptions
      ? 'native'
      : 'reminder',
    ...(providerSubscriptionId ? { providerSubscriptionId } : {}),
    checkoutId: checkout._id,
    ...(checkout.userId ? { userId: checkout.userId } : {}),
    email: checkout.email,
    ...(checkout.name ? { name: checkout.name } : {}),
    locale: checkout.locale,
    currency: checkout.currency,
    amountMinor: checkout.amountMinor,
    status: 'active',
    nextDueAt: addMonthsUtc(startedAt, 1),
    reminderCount: 0,
    createdAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

// --- Paiement confirmé ------------------------------------------------------------

export async function applyPaymentSucceeded(
  ctx: MutationCtx,
  provider: ProviderId,
  evt: PaymentSucceeded,
): Promise<ApplyResult> {
  // 1. IDEMPOTENCE. Un webhook rejoué (le prestataire renvoie tant qu'il n'a
  //    pas eu de 2xx, ou deux événements décrivent le même paiement) retrouve
  //    sa ligne et s'arrête là : ni second paiement, ni second reçu.
  const existing = await ctx.db
    .query('paymentTransactions')
    .withIndex('by_provider_and_payment', (q) =>
      q.eq('provider', provider).eq('providerPaymentId', evt.providerPaymentId),
    )
    .first();
  if (existing) return { status: 'duplicate', transactionId: existing._id };

  // 2. La demande d'origine : par sa référence, ou par l'abonnement.
  let checkout = evt.checkoutRef
    ? await checkoutByRef(ctx, evt.checkoutRef)
    : null;
  let sub = evt.providerSubscriptionId
    ? await subscriptionByProviderId(ctx, provider, evt.providerSubscriptionId)
    : null;
  if (!checkout && sub) checkout = await ctx.db.get(sub.checkoutId);
  if (!checkout) return { status: 'unknown_checkout' };
  if (checkout.provider !== provider) return { status: 'provider_mismatch' };

  // 3. Le montant ENCAISSÉ doit être le montant DEMANDÉ. Un événement qui
  //    annonce autre chose (manipulation de la page du prestataire, erreur
  //    d'intégration) n'ouvre ni reçu ni cotisation : il est journalisé et
  //    traité à la main.
  if (
    evt.currency !== checkout.currency ||
    evt.amountMinor !== checkout.amountMinor
  ) {
    console.error(
      `[payments] montant inattendu pour ${checkout.ref} : ${evt.amountMinor} ${evt.currency} (attendu ${checkout.amountMinor} ${checkout.currency})`,
    );
    return { status: 'amount_mismatch' };
  }
  if (!checkout.recurring && checkout.status === 'completed') {
    // Une demande ponctuelle se règle une fois. Un second identifiant de
    // paiement pour elle est une anomalie, pas un second don.
    console.error(
      `[payments] second paiement pour la demande ponctuelle ${checkout.ref}`,
    );
    return { status: 'already_paid' };
  }

  const paidAt = evt.paidAt;
  let donationId: Id<'donations'> | undefined;
  let subscriptionId: Id<'paymentSubscriptions'> | undefined;
  let duesPlan:
    | {
        category: NonNullable<Doc<'paymentCheckouts'>['category']>;
        zone: NonNullable<Doc<'paymentCheckouts'>['zone']>;
        payer: Id<'users'>;
      }
    | undefined;

  if (checkout.purpose === 'donation') {
    if (checkout.recurring) {
      sub = sub ?? (await subscriptionForCheckout(ctx, checkout));
      if (!sub)
        sub = await createSubscription(
          ctx,
          checkout,
          evt.providerSubscriptionId,
          paidAt,
        );
      else if (!sub.providerSubscriptionId && evt.providerSubscriptionId) {
        await ctx.db.patch(sub._id, {
          providerSubscriptionId: evt.providerSubscriptionId,
        });
      }
      if (!sub.donationId) {
        const origin = (await ctx.db.get(sub.checkoutId)) ?? checkout;
        donationId = await ctx.db.insert('donations', {
          ...(origin.userId ? { donorUserId: origin.userId } : {}),
          email: origin.email,
          ...(origin.name ? { name: origin.name } : {}),
          anonymous: origin.anonymous ?? false,
          kind: 'monthly',
          currency: origin.currency,
          amountMinor: origin.amountMinor,
          ...(origin.message ? { message: origin.message } : {}),
          status: sub.status === 'active' ? 'active' : 'cancelled',
          subscriptionId: sub._id,
          checkoutId: origin._id,
          createdAt: Date.now(),
        });
      } else {
        donationId = sub.donationId;
      }
      // Échéance suivante ancrée sur la précédente (pas sur le jour où l'on a
      // payé en retard), sauf si ce retard l'a déjà dépassée.
      let nextDueAt =
        sub.lastPaidAt === undefined
          ? sub.nextDueAt
          : addMonthsUtc(sub.nextDueAt, 1);
      if (nextDueAt <= paidAt) nextDueAt = addMonthsUtc(paidAt, 1);
      await ctx.db.patch(sub._id, {
        donationId,
        lastPaidAt: paidAt,
        nextDueAt,
        reminderCount: 0,
        // Une relance restée impayée puis réglée réactive l'engagement ; un
        // engagement ARRÊTÉ par le donateur ne se rallume pas.
        ...(sub.status === 'past_due' ? { status: 'active' as const } : {}),
      });
      subscriptionId = sub._id;
    } else {
      donationId = await ctx.db.insert('donations', {
        ...(checkout.userId ? { donorUserId: checkout.userId } : {}),
        email: checkout.email,
        ...(checkout.name ? { name: checkout.name } : {}),
        anonymous: checkout.anonymous ?? false,
        kind: 'one_time',
        currency: checkout.currency,
        amountMinor: checkout.amountMinor,
        ...(checkout.message ? { message: checkout.message } : {}),
        status: 'paid',
        checkoutId: checkout._id,
        createdAt: Date.now(),
      });
    }
  } else {
    if (!checkout.userId || !checkout.category || !checkout.zone) {
      return { status: 'invalid_checkout' };
    }
    duesPlan = {
      category: checkout.category,
      zone: checkout.zone,
      payer: checkout.userId,
    };
  }

  const transactionId = await ctx.db.insert('paymentTransactions', {
    provider,
    providerPaymentId: evt.providerPaymentId,
    ...(evt.providerRef ? { providerRef: evt.providerRef } : {}),
    kind: checkout.purpose,
    currency: checkout.currency,
    amountMinor: checkout.amountMinor,
    status: 'succeeded',
    ...(checkout.userId ? { userId: checkout.userId } : {}),
    email: checkout.email,
    ...(checkout.name ? { name: checkout.name } : {}),
    ...(donationId ? { donationId } : {}),
    ...(subscriptionId ? { subscriptionId } : {}),
    checkoutId: checkout._id,
    paidAt,
    month: monthKey(paidAt),
  });

  let periodEnd: number | undefined;
  if (duesPlan) {
    // Renouvellement anticipé : la nouvelle période commence à la fin de
    // celle en cours, pour que payer en avance ne fasse rien perdre.
    const latest = await ctx.db
      .query('membershipDues')
      .withIndex('by_payer_and_periodEnd', (q) =>
        q.eq('payerUserId', duesPlan.payer),
      )
      .order('desc')
      .first();
    const periodStart =
      latest && latest.status === 'paid' && latest.periodEnd > paidAt
        ? latest.periodEnd
        : paidAt;
    periodEnd = addMonthsUtc(periodStart, MEMBERSHIP_PERIOD_MONTHS);
    const duesId = await ctx.db.insert('membershipDues', {
      payerUserId: duesPlan.payer,
      ...(checkout.orgId ? { orgId: checkout.orgId } : {}),
      ...(checkout.planId ? { planId: checkout.planId } : {}),
      category: duesPlan.category,
      zone: duesPlan.zone,
      currency: checkout.currency,
      amountMinor: checkout.amountMinor,
      periodStart,
      periodEnd,
      status: 'paid',
      transactionId,
      createdAt: Date.now(),
    });
    await ctx.db.patch(transactionId, { duesId });
  }

  await bumpMonthlyTotals(
    ctx,
    {
      month: monthKey(paidAt),
      currency: checkout.currency,
      kind: checkout.purpose,
    },
    { gross: checkout.amountMinor, count: 1 },
  );

  const receiptId = await allocateReceipt(ctx, {
    transactionId,
    ...(checkout.userId ? { userId: checkout.userId } : {}),
    email: checkout.email,
    paidAt,
  });
  await ctx.db.patch(transactionId, { receiptId });

  if (checkout.status !== 'completed') {
    await ctx.db.patch(checkout._id, {
      status: 'completed',
      completedAt: Date.now(),
    });
  }

  if (checkout.userId) {
    await notify(ctx, {
      userId: checkout.userId,
      type: 'payment',
      titleKey:
        checkout.purpose === 'dues'
          ? 'paymentDuesReceived'
          : 'paymentDonationReceived',
      params: {
        amount: String(fromMinor(checkout.amountMinor, checkout.currency)),
        currency: checkout.currency,
      },
      link: '/espace-membre/cotisations',
    });
  }

  // Le PDF (et le courriel qui l'annonce) sont produits hors transaction : une
  // action peut échouer et se relancer sans toucher au paiement enregistré.
  // Seule la COMPOSITION est planifiée (action Node, pour les polices
  // Unicode) ; le numéro vient d'être attribué ci-dessus, dans la transaction.
  await ctx.scheduler.runAfter(0, internal.payments.receiptsNode.generate, {
    receiptId,
  });

  return { status: 'recorded', transactionId };
}

// --- Autres événements --------------------------------------------------------------

export async function applyCheckoutClosed(
  ctx: MutationCtx,
  provider: ProviderId,
  evt: Extract<NormalizedEvent, { kind: 'checkout_closed' }>,
): Promise<void> {
  let checkout = evt.checkoutRef
    ? await checkoutByRef(ctx, evt.checkoutRef)
    : null;
  if (!checkout && evt.providerSessionId) {
    checkout = await ctx.db
      .query('paymentCheckouts')
      .withIndex('by_provider_and_session', (q) =>
        q
          .eq('provider', provider)
          .eq('providerSessionId', evt.providerSessionId),
      )
      .first();
  }
  if (!checkout || checkout.provider !== provider) return;
  // Une demande payée ne redevient jamais « annulée » : l'ordre d'arrivée des
  // webhooks n'est pas garanti.
  if (checkout.status === 'created' || checkout.status === 'open') {
    await ctx.db.patch(checkout._id, { status: evt.outcome });
  }
}

export async function applySubscriptionStarted(
  ctx: MutationCtx,
  provider: ProviderId,
  evt: Extract<NormalizedEvent, { kind: 'subscription_started' }>,
): Promise<void> {
  const checkout = await checkoutByRef(ctx, evt.checkoutRef);
  if (!checkout || checkout.provider !== provider || !checkout.recurring)
    return;
  const sub = await subscriptionForCheckout(ctx, checkout);
  if (sub) {
    if (!sub.providerSubscriptionId) {
      await ctx.db.patch(sub._id, {
        providerSubscriptionId: evt.providerSubscriptionId,
      });
    }
    return;
  }
  await createSubscription(
    ctx,
    checkout,
    evt.providerSubscriptionId,
    Date.now(),
  );
}

export async function markSubscriptionCancelled(
  ctx: MutationCtx,
  sub: Doc<'paymentSubscriptions'>,
): Promise<boolean> {
  if (sub.status === 'cancelled') return false;
  await ctx.db.patch(sub._id, { status: 'cancelled', cancelledAt: Date.now() });
  if (sub.donationId) {
    const donation = await ctx.db.get(sub.donationId);
    if (donation && donation.status === 'active') {
      await ctx.db.patch(donation._id, { status: 'cancelled' });
    }
  }
  return true;
}

export async function applySubscriptionCancelled(
  ctx: MutationCtx,
  provider: ProviderId,
  evt: Extract<NormalizedEvent, { kind: 'subscription_cancelled' }>,
): Promise<void> {
  const sub = await subscriptionByProviderId(
    ctx,
    provider,
    evt.providerSubscriptionId,
  );
  if (sub) await markSubscriptionCancelled(ctx, sub);
}

/**
 * Passe une transaction en « remboursée ». Idempotent : une transaction déjà
 * remboursée n'est pas décomptée deux fois (remboursement marqué au
 * back-office PUIS webhook `charge.refunded` du prestataire, par exemple).
 */
export async function applyRefund(
  ctx: MutationCtx,
  tx: Doc<'paymentTransactions'>,
  opts: { actorId?: Id<'users'>; reason?: string; atProvider: boolean },
): Promise<boolean> {
  if (tx.status === 'refunded') return false;
  await ctx.db.patch(tx._id, {
    status: 'refunded',
    refundedAt: Date.now(),
    ...(opts.actorId ? { refundedBy: opts.actorId } : {}),
    ...(opts.reason ? { refundReason: opts.reason } : {}),
    refundedAtProvider: opts.atProvider,
  });
  // Le remboursement est imputé au MOIS DE L'ENCAISSEMENT : le tableau de bord
  // présente alors, pour chaque mois, ce qui en est resté acquis.
  await bumpMonthlyTotals(
    ctx,
    { month: tx.month, currency: tx.currency, kind: tx.kind },
    { refunded: tx.amountMinor },
  );
  if (tx.donationId) {
    const donation = await ctx.db.get(tx.donationId);
    if (donation && donation.kind === 'one_time') {
      await ctx.db.patch(donation._id, { status: 'refunded' });
    }
  }
  if (tx.duesId) await ctx.db.patch(tx.duesId, { status: 'refunded' });
  return true;
}

export async function applyRefundEvent(
  ctx: MutationCtx,
  provider: ProviderId,
  evt: Extract<NormalizedEvent, { kind: 'refunded' }>,
): Promise<void> {
  let tx: Doc<'paymentTransactions'> | null = null;
  if (evt.providerRef) {
    tx = await ctx.db
      .query('paymentTransactions')
      .withIndex('by_provider_and_ref', (q) =>
        q.eq('provider', provider).eq('providerRef', evt.providerRef),
      )
      .first();
  }
  if (!tx && evt.providerPaymentId) {
    tx = await ctx.db
      .query('paymentTransactions')
      .withIndex('by_provider_and_payment', (q) =>
        q
          .eq('provider', provider)
          .eq('providerPaymentId', evt.providerPaymentId!),
      )
      .first();
  }
  if (tx) await applyRefund(ctx, tx, { atProvider: true });
}

// --- Suppression de compte ----------------------------------------------------------
//
// Les pièces comptables NE SE SUPPRIMENT PAS avec le compte : l'association
// doit conserver ses justificatifs (obligation légale de conservation — c'est
// l'exception de l'art. 17-3-b du RGPD). Ce qui disparaît, c'est le LIEN au
// compte : transactions, dons, reçus et engagements sont détachés du
// `userId`, les engagements récurrents actifs sont arrêtés, et le message
// libre d'un don (donnée non comptable) est effacé. Les cotisations, qui
// exigent un payeur, sont conservées telles quelles jusqu'à la purge du compte
// lui-même par l'appelant ; elles ne portent aucune donnée au-delà de l'id.
const DELETE_BATCH = 200;

export async function deleteUserDataPaiements(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<void> {
  const txs = await ctx.db
    .query('paymentTransactions')
    .withIndex('by_user_and_paidAt', (q) => q.eq('userId', userId))
    .take(DELETE_BATCH);
  for (const tx of txs) await ctx.db.patch(tx._id, { userId: undefined });

  const donations = await ctx.db
    .query('donations')
    .withIndex('by_donor', (q) => q.eq('donorUserId', userId))
    .take(DELETE_BATCH);
  for (const d of donations) {
    await ctx.db.patch(d._id, { donorUserId: undefined, message: undefined });
  }

  const receipts = await ctx.db
    .query('paymentReceipts')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(DELETE_BATCH);
  for (const r of receipts) await ctx.db.patch(r._id, { userId: undefined });

  const subs = await ctx.db
    .query('paymentSubscriptions')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(DELETE_BATCH);
  for (const s of subs) {
    if (s.status !== 'cancelled') {
      await markSubscriptionCancelled(ctx, s);
      if (s.mode === 'native' && s.providerSubscriptionId) {
        await ctx.scheduler.runAfter(
          0,
          internal.payments.member.cancelAtProvider,
          {
            subscriptionId: s._id,
          },
        );
      }
    }
    await ctx.db.patch(s._id, { userId: undefined });
  }
}

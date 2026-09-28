import { ConvexError, v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { internal } from '../_generated/api';
import {
  action,
  internalMutation,
  mutation,
  query,
} from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { requireNetworkRole } from '../lib/rbac';
import { recordAudit } from '../lib/audit';
import { AUDIT } from '../lib/auditActions';
import { clampPageSize, paginatedValidator } from '../lib/pagination';
import { applyRefund } from '../lib/payments/ledger';
import { getAdapter } from '../lib/payments/registry';
import { fakeProviderState, stripeConfigured } from '../lib/payments/config';
import { FIELD_MAX } from '../lib/validation';
import {
  currencyValidator,
  paymentPurposeValidator,
  providerIdValidator,
  transactionStatusValidator,
} from '../lib/payments/validators';
import { cancelSubscriptionEverywhere } from './member';

// SUIVI FINANCIER (F-31) — back-office, ADMINISTRATEURS uniquement : montants,
// identités des payeurs et remboursements sont des données sensibles. Chaque
// geste qui change l'argent (remboursement, arrêt d'un don) ou qui en sort une
// copie (export) est journalisé.

// --- Tableau de bord --------------------------------------------------------------

export const dashboard = query({
  args: {
    // Premier mois affiché, « AAAA-MM » (fourni par le client : une query ne
    // lit pas l'horloge).
    fromMonth: v.string(),
  },
  returns: v.object({
    providers: v.object({
      stripe: v.boolean(),
      fake: v.union(
        v.literal('off'),
        v.literal('active'),
        v.literal('refused'),
      ),
    }),
    months: v.array(
      v.object({
        month: v.string(),
        currency: currencyValidator,
        kind: paymentPurposeValidator,
        grossMinor: v.number(),
        refundedMinor: v.number(),
        count: v.number(),
      }),
    ),
    activeSubscriptions: v.number(),
    activeSubscriptionsCapped: v.boolean(),
  }),
  handler: async (ctx, { fromMonth }) => {
    await requireNetworkRole(ctx, 'admin');
    // Au plus 24 mois × 2 devises × 2 types : lecture bornée par l'index.
    const months = await ctx.db
      .query('paymentMonthlyTotals')
      .withIndex('by_month', (q) => q.gte('month', fromMonth))
      .take(24 * 2 * 2);
    const ACTIVE_CAP = 500;
    const active = await ctx.db
      .query('paymentSubscriptions')
      .withIndex('by_status_and_nextDueAt', (q) => q.eq('status', 'active'))
      .take(ACTIVE_CAP + 1);
    return {
      providers: {
        stripe: stripeConfigured(),
        fake: fakeProviderState(),
      },
      months: months.map((m) => ({
        month: m.month,
        currency: m.currency,
        kind: m.kind,
        grossMinor: m.grossMinor,
        refundedMinor: m.refundedMinor,
        count: m.count,
      })),
      activeSubscriptions: Math.min(active.length, ACTIVE_CAP),
      activeSubscriptionsCapped: active.length > ACTIVE_CAP,
    };
  },
});

// --- Transactions -------------------------------------------------------------------

const transactionRowValidator = v.object({
  _id: v.id('paymentTransactions'),
  provider: providerIdValidator,
  providerPaymentId: v.string(),
  kind: paymentPurposeValidator,
  currency: currencyValidator,
  amountMinor: v.number(),
  status: transactionStatusValidator,
  email: v.string(),
  name: v.union(v.string(), v.null()),
  paidAt: v.number(),
  recurring: v.boolean(),
  receiptId: v.union(v.id('paymentReceipts'), v.null()),
  receiptNumber: v.union(v.string(), v.null()),
  refundedAt: v.union(v.number(), v.null()),
  refundReason: v.union(v.string(), v.null()),
  refundedAtProvider: v.union(v.boolean(), v.null()),
  canRefundAtProvider: v.boolean(),
});

async function toRow(
  ctx: {
    db: {
      get: (
        id: Id<'paymentReceipts'>,
      ) => Promise<Doc<'paymentReceipts'> | null>;
    };
  },
  tx: Doc<'paymentTransactions'>,
) {
  const receipt = tx.receiptId ? await ctx.db.get(tx.receiptId) : null;
  const adapter = getAdapter(tx.provider);
  return {
    _id: tx._id,
    provider: tx.provider,
    providerPaymentId: tx.providerPaymentId,
    kind: tx.kind,
    currency: tx.currency,
    amountMinor: tx.amountMinor,
    status: tx.status,
    email: tx.email,
    name: tx.name ?? null,
    paidAt: tx.paidAt,
    recurring: tx.subscriptionId !== undefined,
    receiptId: tx.receiptId ?? null,
    receiptNumber: receipt?.number ?? null,
    refundedAt: tx.refundedAt ?? null,
    refundReason: tx.refundReason ?? null,
    refundedAtProvider: tx.refundedAtProvider ?? null,
    canRefundAtProvider:
      adapter.refund !== undefined &&
      (tx.provider === 'fake' || tx.providerRef !== undefined),
  };
}

const PAGE_MAX = 100;

export const listTransactions = query({
  args: {
    paginationOpts: paginationOptsValidator,
    kind: v.optional(paymentPurposeValidator),
    currency: v.optional(currencyValidator),
    status: v.optional(transactionStatusValidator),
    provider: v.optional(providerIdValidator),
  },
  returns: paginatedValidator(transactionRowValidator),
  handler: async (
    ctx,
    { paginationOpts, kind, currency, status, provider },
  ) => {
    await requireNetworkRole(ctx, 'admin');
    // Chronologique décroissant par l'index ; les filtres (quatre critères
    // combinables, faible cardinalité) s'appliquent après l'index. Une page
    // filtrée peut donc revenir plus courte que demandé — « charger la suite »
    // la complète.
    const result = await ctx.db
      .query('paymentTransactions')
      .withIndex('by_paidAt')
      .order('desc')
      .filter((q) =>
        q.and(
          kind ? q.eq(q.field('kind'), kind) : true,
          currency ? q.eq(q.field('currency'), currency) : true,
          status ? q.eq(q.field('status'), status) : true,
          provider ? q.eq(q.field('provider'), provider) : true,
        ),
      )
      .paginate(clampPageSize(paginationOpts, PAGE_MAX));
    return {
      ...result,
      page: await Promise.all(result.page.map((tx) => toRow(ctx, tx))),
    };
  },
});

// Export comptable : une MUTATION, pour que la sortie des données soit
// journalisée (qui a exporté quelle période). Bornée : au-delà, exporter par
// périodes plus courtes.
export const EXPORT_MAX = 5000;

export const exportTransactions = mutation({
  args: { fromMs: v.number(), toMs: v.number() },
  returns: v.object({
    rows: v.array(transactionRowValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, { fromMs, toMs }) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    const txs = await ctx.db
      .query('paymentTransactions')
      .withIndex('by_paidAt', (q) => q.gte('paidAt', fromMs).lt('paidAt', toMs))
      .order('asc')
      .take(EXPORT_MAX + 1);
    const truncated = txs.length > EXPORT_MAX;
    const rows = await Promise.all(
      txs.slice(0, EXPORT_MAX).map((tx) => toRow(ctx, tx)),
    );
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.PAYMENT_EXPORTED,
      metadata: { fromMs, toMs, rows: rows.length, truncated },
    });
    return { rows, truncated };
  },
});

// --- Cotisations en retard ------------------------------------------------------------
//
// « En retard » = la DERNIÈRE période réglée d'un payeur est échue. On part des
// périodes échues (index par date de fin), puis on écarte celles dont le payeur
// a réglé une période plus récente. Un membre qui n'a JAMAIS cotisé n'apparaît
// pas ici : il n'est pas en retard, il n'a pas commencé (limite documentée).
const LATE_SCAN = 300;

export const lateDues = query({
  args: { now: v.number() },
  returns: v.array(
    v.object({
      payerUserId: v.id('users'),
      email: v.union(v.string(), v.null()),
      name: v.union(v.string(), v.null()),
      organization: v.union(v.string(), v.null()),
      periodEnd: v.number(),
      currency: currencyValidator,
      amountMinor: v.number(),
    }),
  ),
  handler: async (ctx, { now }) => {
    await requireNetworkRole(ctx, 'admin');
    const expired = await ctx.db
      .query('membershipDues')
      .withIndex('by_status_and_periodEnd', (q) =>
        q.eq('status', 'paid').lt('periodEnd', now),
      )
      .order('desc')
      .take(LATE_SCAN);
    const seen = new Set<Id<'users'>>();
    const out = [];
    for (const d of expired) {
      if (seen.has(d.payerUserId)) continue;
      seen.add(d.payerUserId);
      const latest = await ctx.db
        .query('membershipDues')
        .withIndex('by_payer_and_periodEnd', (q) =>
          q.eq('payerUserId', d.payerUserId),
        )
        .order('desc')
        .filter((q) => q.eq(q.field('status'), 'paid'))
        .first();
      if (!latest || latest._id !== d._id) continue;
      const payer = await ctx.db.get(d.payerUserId);
      const org = d.orgId ? await ctx.db.get(d.orgId) : null;
      out.push({
        payerUserId: d.payerUserId,
        email: payer?.email ?? null,
        name: payer?.name ?? null,
        organization: org?.name ?? null,
        periodEnd: d.periodEnd,
        currency: d.currency,
        amountMinor: d.amountMinor,
      });
    }
    return out;
  },
});

// --- Remboursements ---------------------------------------------------------------------

const REASON_MAX = FIELD_MAX.subject;

function checkReason(reason: string): string {
  const r = reason.trim();
  if (r.length < 3 || r.length > REASON_MAX)
    throw new ConvexError('INVALID_REASON');
  return r;
}

// Remboursement MARQUÉ : l'argent est rendu hors plateforme (virement, geste
// dans le tableau de bord du prestataire, prestataire sans API). Le grand
// livre en prend acte sans appeler personne.
export const markRefunded = mutation({
  args: { transactionId: v.id('paymentTransactions'), reason: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { transactionId, reason }) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    const r = checkReason(reason);
    const tx = await ctx.db.get(transactionId);
    if (!tx) throw new ConvexError('NOT_FOUND');
    const changed = await applyRefund(ctx, tx, {
      actorId: admin._id,
      reason: r,
      atProvider: false,
    });
    if (changed) {
      await recordAudit(ctx, {
        actorId: admin._id,
        action: AUDIT.PAYMENT_REFUNDED,
        targetId: transactionId,
        metadata: {
          reason: r,
          atProvider: false,
          amountMinor: tx.amountMinor,
          currency: tx.currency,
        },
      });
    }
    return changed;
  },
});

export const prepareProviderRefund = internalMutation({
  args: { transactionId: v.id('paymentTransactions'), reason: v.string() },
  returns: v.object({
    adminId: v.id('users'),
    provider: providerIdValidator,
    providerPaymentId: v.string(),
    providerRef: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { transactionId, reason }) => {
    // L'identité de l'appelant traverse `runMutation` depuis l'action : la
    // garde de rang se fait ici, dans une transaction.
    const admin = await requireNetworkRole(ctx, 'admin');
    checkReason(reason);
    const tx = await ctx.db.get(transactionId);
    if (!tx) throw new ConvexError('NOT_FOUND');
    if (tx.status === 'refunded') throw new ConvexError('ALREADY_REFUNDED');
    return {
      adminId: admin._id,
      provider: tx.provider,
      providerPaymentId: tx.providerPaymentId,
      providerRef: tx.providerRef ?? null,
    };
  },
});

export const recordProviderRefund = internalMutation({
  args: {
    transactionId: v.id('paymentTransactions'),
    adminId: v.id('users'),
    reason: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { transactionId, adminId, reason }) => {
    const tx = await ctx.db.get(transactionId);
    if (!tx) return false;
    const changed = await applyRefund(ctx, tx, {
      actorId: adminId,
      reason: reason.trim(),
      atProvider: true,
    });
    if (changed) {
      await recordAudit(ctx, {
        actorId: adminId,
        action: AUDIT.PAYMENT_REFUNDED,
        targetId: transactionId,
        metadata: {
          reason: reason.trim(),
          atProvider: true,
          amountMinor: tx.amountMinor,
          currency: tx.currency,
        },
      });
    }
    return changed;
  },
});

// Remboursement EXÉCUTÉ chez le prestataire (Stripe, ou factice en test).
export const refundAtProvider = action({
  args: { transactionId: v.id('paymentTransactions'), reason: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { transactionId, reason }): Promise<boolean> => {
    const target = await ctx.runMutation(
      internal.payments.finances.prepareProviderRefund,
      { transactionId, reason },
    );
    const adapter = getAdapter(target.provider);
    if (!adapter.refund) throw new ConvexError('REFUND_UNSUPPORTED');
    let done: boolean;
    try {
      done = await adapter.refund({
        providerPaymentId: target.providerPaymentId,
        ...(target.providerRef ? { providerRef: target.providerRef } : {}),
      });
    } catch (err) {
      console.error('[payments] remboursement refusé par le prestataire', err);
      throw new ConvexError('PROVIDER_ERROR');
    }
    if (!done) throw new ConvexError('REFUND_UNSUPPORTED');
    return await ctx.runMutation(
      internal.payments.finances.recordProviderRefund,
      {
        transactionId,
        adminId: target.adminId,
        reason,
      },
    );
  },
});

// --- Dons mensuels ---------------------------------------------------------------------

export const listSubscriptions = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginatedValidator(
    v.object({
      _id: v.id('paymentSubscriptions'),
      provider: providerIdValidator,
      mode: v.union(v.literal('native'), v.literal('reminder')),
      status: v.union(
        v.literal('active'),
        v.literal('cancelled'),
        v.literal('past_due'),
      ),
      email: v.string(),
      currency: currencyValidator,
      amountMinor: v.number(),
      nextDueAt: v.number(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { paginationOpts }) => {
    await requireNetworkRole(ctx, 'admin');
    const result = await ctx.db
      .query('paymentSubscriptions')
      .order('desc')
      .paginate(clampPageSize(paginationOpts, PAGE_MAX));
    return {
      ...result,
      page: result.page.map((s) => ({
        _id: s._id,
        provider: s.provider,
        mode: s.mode,
        status: s.status,
        email: s.email,
        currency: s.currency,
        amountMinor: s.amountMinor,
        nextDueAt: s.nextDueAt,
        createdAt: s.createdAt,
      })),
    };
  },
});

export const cancelSubscription = mutation({
  args: { subscriptionId: v.id('paymentSubscriptions') },
  returns: v.boolean(),
  handler: async (ctx, { subscriptionId }) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    return await cancelSubscriptionEverywhere(
      ctx,
      subscriptionId,
      admin._id,
      'admin',
    );
  },
});

// --- Journal ------------------------------------------------------------------------------

export const auditTrail = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginatedValidator(
    v.object({
      action: v.string(),
      createdAt: v.number(),
      targetId: v.union(v.string(), v.null()),
      actorEmail: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { paginationOpts }) => {
    await requireNetworkRole(ctx, 'admin');
    // Index plein texte du journal : le slug `payment.*` y est découpé, le
    // mot « payment » remonte donc toute la famille.
    const result = await ctx.db
      .query('auditLog')
      .withSearchIndex('search_action', (q) => q.search('action', 'payment'))
      .paginate(clampPageSize(paginationOpts, PAGE_MAX));
    const page = await Promise.all(
      result.page
        .filter((e) => e.action.startsWith('payment.'))
        .map(async (e) => {
          const actor = e.actorId ? await ctx.db.get(e.actorId) : null;
          return {
            action: e.action,
            createdAt: e.createdAt,
            targetId: e.targetId ?? null,
            actorEmail: actor?.email ?? null,
          };
        }),
    );
    return { ...result, page };
  },
});

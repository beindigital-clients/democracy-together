import { ConvexError, v } from 'convex/values';
import { internal } from '../_generated/api';
import {
  internalAction,
  internalQuery,
  mutation,
  query,
} from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { locale } from '../lib/locales';
import { requireUser } from '../lib/rbac';
import { roleRank } from '../lib/roles';
import { recordAudit } from '../lib/audit';
import { AUDIT } from '../lib/auditActions';
import { markSubscriptionCancelled } from '../lib/payments/ledger';
import { getAdapter } from '../lib/payments/registry';
import { sendEmail } from '../email';
import { recurringCancelledEmail } from '../lib/payments/emails';
import {
  currencyValidator,
  paymentPurposeValidator,
  planCategoryValidator,
  planZoneValidator,
  providerIdValidator,
  subscriptionModeValidator,
  subscriptionStatusValidator,
  transactionStatusValidator,
} from '../lib/payments/validators';

// MEMBER / DONOR AREA (F-30) — current membership fee, history, receipts,
// monthly donations. Everything is read by the SIGNED-IN account: no function takes
// a user id as an argument.

const HISTORY_MAX = 50;

export const overview = query({
  args: {
    // The time comes from the client (rounded): a query does not read the clock,
    // otherwise "up to date / lapsed" would never be recomputed.
    now: v.number(),
  },
  returns: v.object({
    dues: v.union(
      v.null(),
      v.object({
        category: planCategoryValidator,
        zone: planZoneValidator,
        currency: currencyValidator,
        amountMinor: v.number(),
        periodStart: v.number(),
        periodEnd: v.number(),
        upToDate: v.boolean(),
      }),
    ),
    transactions: v.array(
      v.object({
        _id: v.id('paymentTransactions'),
        kind: paymentPurposeValidator,
        currency: currencyValidator,
        amountMinor: v.number(),
        status: transactionStatusValidator,
        paidAt: v.number(),
        recurring: v.boolean(),
        receipt: v.union(
          v.null(),
          v.object({
            _id: v.id('paymentReceipts'),
            number: v.string(),
            ready: v.boolean(),
          }),
        ),
      }),
    ),
    subscriptions: v.array(
      v.object({
        _id: v.id('paymentSubscriptions'),
        provider: providerIdValidator,
        mode: subscriptionModeValidator,
        status: subscriptionStatusValidator,
        currency: currencyValidator,
        amountMinor: v.number(),
        nextDueAt: v.number(),
        createdAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, { now }) => {
    const user = await requireUser(ctx);
    const latestDues = await ctx.db
      .query('membershipDues')
      .withIndex('by_payer_and_periodEnd', (q) => q.eq('payerUserId', user._id))
      .order('desc')
      .filter((q) => q.eq(q.field('status'), 'paid'))
      .first();

    const txs = await ctx.db
      .query('paymentTransactions')
      .withIndex('by_user_and_paidAt', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(HISTORY_MAX);
    const transactions = await Promise.all(
      txs.map(async (tx) => {
        const receipt = tx.receiptId ? await ctx.db.get(tx.receiptId) : null;
        return {
          _id: tx._id,
          kind: tx.kind,
          currency: tx.currency,
          amountMinor: tx.amountMinor,
          status: tx.status,
          paidAt: tx.paidAt,
          recurring: tx.subscriptionId !== undefined,
          receipt: receipt
            ? {
                _id: receipt._id,
                number: receipt.number,
                ready: receipt.storageId !== undefined,
              }
            : null,
        };
      }),
    );

    const subs = await ctx.db
      .query('paymentSubscriptions')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(HISTORY_MAX);

    return {
      dues: latestDues
        ? {
            category: latestDues.category,
            zone: latestDues.zone,
            currency: latestDues.currency,
            amountMinor: latestDues.amountMinor,
            periodStart: latestDues.periodStart,
            periodEnd: latestDues.periodEnd,
            upToDate: latestDues.periodEnd > now,
          }
        : null,
      transactions,
      subscriptions: subs.map((s) => ({
        _id: s._id,
        provider: s.provider,
        mode: s.mode,
        status: s.status,
        currency: s.currency,
        amountMinor: s.amountMinor,
        nextDueAt: s.nextDueAt,
        createdAt: s.createdAt,
      })),
    };
  },
});

// --- Receipts: download ---------------------------------------------------------------
//
// Two doors, and only two:
//  - the ACCOUNT that owns the payment (or an administrator);
//  - the LINK emailed to the payer, carrying a random 192-bit
//    token — the only way for a donor without an account to retrieve their
//    receipt. It is only as good as their mailbox, like a password
//    reset link.
// The returned URL is the Convex storage one, signed and unguessable.

export const receiptDownloadUrl = query({
  args: { receiptId: v.id('paymentReceipts') },
  returns: v.union(v.null(), v.object({ number: v.string(), url: v.string() })),
  handler: async (ctx, { receiptId }) => {
    const user = await requireUser(ctx);
    const receipt = await ctx.db.get(receiptId);
    if (!receipt) return null;
    const isOwner = receipt.userId !== undefined && receipt.userId === user._id;
    const isAdmin = roleRank(user.role) >= roleRank('admin');
    // Same response for "does not exist" and "not yours"? No: the caller
    // is authenticated and the id is not guessable data; an
    // explicit refusal is more useful than silence.
    if (!isOwner && !isAdmin) throw new ConvexError('FORBIDDEN');
    if (!receipt.storageId) return null;
    const url = await ctx.storage.getUrl(receipt.storageId);
    return url ? { number: receipt.number, url } : null;
  },
});

export const receiptByToken = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({ number: v.string(), url: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx, { token }) => {
    // 24-byte token in hexadecimal: everything else is refused without a read.
    if (!/^[0-9a-f]{48}$/.test(token)) return null;
    const receipt = await ctx.db
      .query('paymentReceipts')
      .withIndex('by_token', (q) => q.eq('accessToken', token))
      .unique();
    if (!receipt) return null;
    const url = receipt.storageId
      ? await ctx.storage.getUrl(receipt.storageId)
      : null;
    return { number: receipt.number, url };
  },
});

// --- Stopping a monthly donation --------------------------------------------------------

// The donor stops their donation: IMMEDIATE effect on the association side (no more
// reminders, status "stopped"), then cancellation with the provider when it
// collects itself (Stripe). If that call fails, the
// `customer.subscription.deleted` webhook does not arrive and the failure is logged:
// the administrator sees it in the Finances screen (subscription stopped here,
// still active at Stripe) — see docs/backlog/paiements.md.
export const cancelMyRecurring = mutation({
  args: { subscriptionId: v.id('paymentSubscriptions') },
  returns: v.null(),
  handler: async (ctx, { subscriptionId }) => {
    const user = await requireUser(ctx);
    const sub = await ctx.db.get(subscriptionId);
    if (!sub || sub.userId !== user._id) throw new ConvexError('FORBIDDEN');
    await cancelSubscriptionEverywhere(ctx, subscriptionId, user._id, 'member');
    return null;
  },
});

export async function cancelSubscriptionEverywhere(
  ctx: Parameters<typeof markSubscriptionCancelled>[0],
  subscriptionId: Id<'paymentSubscriptions'>,
  actorId: Id<'users'>,
  by: 'member' | 'admin',
): Promise<boolean> {
  const sub = await ctx.db.get(subscriptionId);
  if (!sub) return false;
  const changed = await markSubscriptionCancelled(ctx, sub);
  if (!changed) return false;
  await recordAudit(ctx, {
    actorId,
    action: AUDIT.PAYMENT_SUBSCRIPTION_CANCELLED,
    targetId: subscriptionId,
    metadata: { by },
  });
  if (sub.mode === 'native' && sub.providerSubscriptionId) {
    await ctx.scheduler.runAfter(0, internal.payments.member.cancelAtProvider, {
      subscriptionId,
    });
  }
  await ctx.scheduler.runAfter(0, internal.payments.member.sendCancelledEmail, {
    subscriptionId,
  });
  return true;
}

export const subscriptionForProvider = internalQuery({
  args: { subscriptionId: v.id('paymentSubscriptions') },
  returns: v.union(
    v.null(),
    v.object({
      provider: providerIdValidator,
      providerSubscriptionId: v.union(v.string(), v.null()),
      email: v.string(),
      locale,
      currency: currencyValidator,
      amountMinor: v.number(),
    }),
  ),
  handler: async (ctx, { subscriptionId }) => {
    const sub = await ctx.db.get(subscriptionId);
    if (!sub) return null;
    return {
      provider: sub.provider,
      providerSubscriptionId: sub.providerSubscriptionId ?? null,
      email: sub.email,
      locale: sub.locale,
      currency: sub.currency,
      amountMinor: sub.amountMinor,
    };
  },
});

export const cancelAtProvider = internalAction({
  args: { subscriptionId: v.id('paymentSubscriptions') },
  returns: v.null(),
  handler: async (ctx, { subscriptionId }) => {
    const sub = await ctx.runQuery(
      internal.payments.member.subscriptionForProvider,
      {
        subscriptionId,
      },
    );
    if (!sub?.providerSubscriptionId) return null;
    const adapter = getAdapter(sub.provider);
    if (!adapter.cancelSubscription) return null;
    try {
      await adapter.cancelSubscription(sub.providerSubscriptionId);
    } catch (err) {
      console.error(
        `[payments] annulation ${sub.provider} ${sub.providerSubscriptionId} ÉCHOUÉE — à faire à la main dans le tableau de bord du prestataire`,
        err,
      );
    }
    return null;
  },
});

export const sendCancelledEmail = internalAction({
  args: { subscriptionId: v.id('paymentSubscriptions') },
  returns: v.null(),
  handler: async (ctx, { subscriptionId }) => {
    const sub = await ctx.runQuery(
      internal.payments.member.subscriptionForProvider,
      {
        subscriptionId,
      },
    );
    if (!sub) return null;
    try {
      const { subject, html } = recurringCancelledEmail({
        amountMinor: sub.amountMinor,
        currency: sub.currency,
        locale: sub.locale,
      });
      await sendEmail({ to: sub.email, subject, html });
    } catch (err) {
      console.error('[payments] courriel d’arrêt non envoyé', err);
    }
    return null;
  },
});

// Used by account deletion (orchestrator): see
// `deleteUserDataPaiements` in convex/lib/payments/ledger.ts.
export { deleteUserDataPaiements } from '../lib/payments/ledger';

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

// ESPACE MEMBRE / DONATEUR (F-30) — cotisation en cours, historique, reçus,
// dons mensuels. Tout est lu par le compte CONNECTÉ : aucune fonction ne prend
// un identifiant d'utilisateur en argument.

const HISTORY_MAX = 50;

export const overview = query({
  args: {
    // L'heure vient du client (arrondie) : une query ne lit pas l'horloge,
    // sans quoi « à jour / échue » ne se recalculerait jamais.
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

// --- Reçus : téléchargement -----------------------------------------------------------
//
// Deux portes, et deux seulement :
//  - le COMPTE propriétaire du paiement (ou un administrateur) ;
//  - le LIEN envoyé par courriel au payeur, porteur d'un jeton aléatoire de
//    192 bits — le seul moyen pour un donateur sans compte de retrouver son
//    reçu. Il vaut ce que vaut sa boîte aux lettres, comme un lien de
//    réinitialisation.
// L'URL rendue est celle du stockage Convex, signée et non devinable.

export const receiptDownloadUrl = query({
  args: { receiptId: v.id('paymentReceipts') },
  returns: v.union(v.null(), v.object({ number: v.string(), url: v.string() })),
  handler: async (ctx, { receiptId }) => {
    const user = await requireUser(ctx);
    const receipt = await ctx.db.get(receiptId);
    if (!receipt) return null;
    const isOwner = receipt.userId !== undefined && receipt.userId === user._id;
    const isAdmin = roleRank(user.role) >= roleRank('admin');
    // Même réponse pour « n'existe pas » et « pas à vous » ? Non : l'appelant
    // est authentifié et l'identifiant n'est pas une donnée devinable ; un
    // refus explicite est plus utile qu'un silence.
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
    // Jeton de 24 octets en hexadécimal : tout le reste est refusé sans lecture.
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

// --- Arrêt d'un don mensuel ----------------------------------------------------------

// Le donateur arrête son don : effet IMMÉDIAT côté association (plus de
// relance, statut « arrêté »), puis annulation chez le prestataire quand il
// prélève lui-même (Stripe). Si cet appel échoue, le webhook
// `customer.subscription.deleted` n'arrive pas et l'échec est journalisé :
// l'administrateur le voit dans l'écran Finances (abonnement arrêté ici,
// encore actif chez Stripe) — cf. docs/backlog/paiements.md.
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

// Utilisé par la suppression de compte (orchestrateur) : voir
// `deleteUserDataPaiements` dans convex/lib/payments/ledger.ts.
export { deleteUserDataPaiements } from '../lib/payments/ledger';

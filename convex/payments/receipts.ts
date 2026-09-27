import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalMutation, internalQuery } from '../_generated/server';
import { locale } from '../lib/locales';
import {
  currencyValidator,
  paymentPurposeValidator,
  providerIdValidator,
} from '../lib/payments/validators';

// REÇUS (F-29) — données du reçu et enregistrement de son fichier.
//
// La composition du PDF et le courriel de confirmation sont dans
// `./receiptsNode.ts` (action Node : pdfkit + polices embarquées, pour
// imprimer un nom arabe ou vietnamien). Elle est planifiée par le grand livre
// juste après l'inscription d'un paiement ; le numéro est DÉJÀ attribué, dans
// la transaction du paiement (convex/lib/payments/ledger.ts). Rejouable sans
// effet de bord : un reçu déjà produit n'est pas refait.

const CATEGORY_LABEL: Record<string, string> = {
  org: 'Organisation (think tank)',
  ind: 'Individuel',
  jeu: 'Jeune (moins de 35 ans)',
};
const ZONE_LABEL: Record<string, string> = {
  high: 'pays à revenu élevé',
  mid: 'pays à revenu intermédiaire',
  low: 'pays à revenu modeste',
};

export const receiptData = internalQuery({
  args: { receiptId: v.id('paymentReceipts') },
  returns: v.union(
    v.null(),
    v.object({
      number: v.string(),
      alreadyGenerated: v.boolean(),
      accessToken: v.string(),
      kind: paymentPurposeValidator,
      recurring: v.boolean(),
      amountMinor: v.number(),
      currency: currencyValidator,
      paidAt: v.number(),
      payerName: v.union(v.string(), v.null()),
      payerEmail: v.string(),
      provider: providerIdValidator,
      providerPaymentId: v.string(),
      period: v.union(
        v.null(),
        v.object({ start: v.number(), end: v.number() }),
      ),
      planLabel: v.union(v.string(), v.null()),
      locale,
    }),
  ),
  handler: async (ctx, { receiptId }) => {
    const receipt = await ctx.db.get(receiptId);
    if (!receipt) return null;
    const tx = await ctx.db.get(receipt.transactionId);
    if (!tx) return null;
    const checkout = await ctx.db.get(tx.checkoutId);
    const dues = tx.duesId ? await ctx.db.get(tx.duesId) : null;
    return {
      number: receipt.number,
      alreadyGenerated: receipt.storageId !== undefined,
      accessToken: receipt.accessToken,
      kind: tx.kind,
      recurring: tx.subscriptionId !== undefined,
      amountMinor: tx.amountMinor,
      currency: tx.currency,
      paidAt: tx.paidAt,
      payerName: tx.name ?? null,
      payerEmail: tx.email,
      provider: tx.provider,
      providerPaymentId: tx.providerPaymentId,
      period: dues ? { start: dues.periodStart, end: dues.periodEnd } : null,
      planLabel: dues
        ? `${CATEGORY_LABEL[dues.category]}, ${ZONE_LABEL[dues.zone]}`
        : null,
      locale: checkout?.locale ?? 'fr',
    };
  },
});

export const saveReceiptFile = internalMutation({
  args: { receiptId: v.id('paymentReceipts'), storageId: v.id('_storage') },
  returns: v.boolean(),
  handler: async (ctx, { receiptId, storageId }) => {
    const receipt = await ctx.db.get(receiptId);
    if (!receipt) {
      await ctx.storage.delete(storageId);
      return false;
    }
    if (receipt.storageId) {
      // Deux générations concurrentes : on garde la première.
      await ctx.storage.delete(storageId);
      return false;
    }
    await ctx.db.patch(receiptId, { storageId, generatedAt: Date.now() });
    return true;
  },
});

// Régénération (reçu dont le PDF a échoué) — rejouable depuis la CLI :
// `npx convex run payments/receipts:regenerate '{"receiptId":"…"}'`.
export const regenerate = internalMutation({
  args: { receiptId: v.id('paymentReceipts') },
  returns: v.null(),
  handler: async (ctx, { receiptId }) => {
    await ctx.scheduler.runAfter(0, internal.payments.receiptsNode.generate, {
      receiptId,
    });
    return null;
  },
});

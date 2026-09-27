import { v } from 'convex/values';
import { internal } from '../_generated/api';
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../_generated/server';
import { sendEmail } from '../email';
import { locale } from '../lib/locales';
import { associationInfo, receiptLinkUrl } from '../lib/payments/config';
import { buildReceiptPdf } from '../lib/payments/receiptPdf';
import { paymentConfirmationEmail } from '../lib/payments/emails';
import {
  currencyValidator,
  paymentPurposeValidator,
  providerIdValidator,
} from '../lib/payments/validators';

// REÇUS (F-29) — production du PDF et courriel de confirmation.
//
// Planifié par le grand livre juste après l'inscription d'un paiement. Le
// numéro est DÉJÀ attribué (dans la transaction du paiement) : cette action ne
// fait que produire le fichier, le ranger dans le stockage Convex, et
// prévenir le payeur. Rejouable sans effet de bord : un reçu déjà produit
// n'est pas refait.

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

export const generate = internalAction({
  args: { receiptId: v.id('paymentReceipts') },
  returns: v.null(),
  handler: async (ctx, { receiptId }) => {
    const data = await ctx.runQuery(internal.payments.receipts.receiptData, {
      receiptId,
    });
    if (!data || data.alreadyGenerated) return null;

    const pdf = await buildReceiptPdf({
      number: data.number,
      kind: data.kind,
      recurring: data.recurring,
      amountMinor: data.amountMinor,
      currency: data.currency,
      paidAt: data.paidAt,
      payerName: data.payerName,
      payerEmail: data.payerEmail,
      provider: data.provider,
      providerPaymentId: data.providerPaymentId,
      period: data.period,
      planLabel: data.planLabel,
      association: associationInfo(),
      issuedAt: Date.now(),
    });
    const storageId = await ctx.storage.store(
      new Blob([pdf as BlobPart], { type: 'application/pdf' }),
    );
    const saved = await ctx.runMutation(
      internal.payments.receipts.saveReceiptFile,
      {
        receiptId,
        storageId,
      },
    );
    if (!saved) return null;

    // Courriel de confirmation : un échec (pas de fournisseur e-mail) ne défait
    // rien — le paiement et le reçu existent, le reçu reste dans l'espace
    // membre et au back-office.
    try {
      const { subject, html } = paymentConfirmationEmail({
        kind: data.kind,
        recurring: data.recurring,
        amountMinor: data.amountMinor,
        currency: data.currency,
        receiptNumber: data.number,
        receiptUrl: receiptLinkUrl(data.locale, data.accessToken),
        locale: data.locale,
      });
      await sendEmail({ to: data.payerEmail, subject, html });
    } catch (err) {
      console.error(
        `[payments] courriel de confirmation non envoyé (${data.number})`,
        err,
      );
    }
    return null;
  },
});

// Régénération (reçu dont le PDF a échoué) — rejouable depuis la CLI :
// `npx convex run payments/receipts:regenerate '{"receiptId":"…"}'`.
export const regenerate = internalMutation({
  args: { receiptId: v.id('paymentReceipts') },
  returns: v.null(),
  handler: async (ctx, { receiptId }) => {
    await ctx.scheduler.runAfter(0, internal.payments.receipts.generate, {
      receiptId,
    });
    return null;
  },
});

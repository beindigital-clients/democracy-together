'use node';

import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalAction } from '../_generated/server';
import { sendEmail } from '../email';
import { associationInfo, receiptLinkUrl } from '../lib/payments/config';
import { buildReceiptPdf } from '../lib/payments/receiptPdf';
import { paymentConfirmationEmail } from '../lib/payments/emails';

// REÇUS (F-29) — composition du PDF et courriel de confirmation, runtime Node.
//
// Pourquoi Node : le reçu imprime le nom du payeur dans son écriture (arabe
// lié, vietnamien…), ce qui demande des polices embarquées et la mise en
// forme OpenType de pdfkit + fontkit, qui s'appuient sur les flux et zlib de
// Node (convex/lib/payments/receiptPdf.ts). Seule la COMPOSITION est ici :
// le numéro du reçu est attribué dans la transaction du paiement
// (convex/lib/payments/ledger.ts), qui planifie cette action ; la lecture des
// données et l'enregistrement du fichier restent des fonctions du runtime par
// défaut (./receipts.ts). Rejouable : un reçu déjà produit n'est pas refait.

export const generate = internalAction({
  args: { receiptId: v.id('paymentReceipts') },
  returns: v.null(),
  handler: async (ctx, { receiptId }): Promise<null> => {
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
    const saved: boolean = await ctx.runMutation(
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

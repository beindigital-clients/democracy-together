'use node';

import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalAction } from '../_generated/server';
import { sendEmail } from '../email';
import { associationInfo, receiptLinkUrl } from '../lib/payments/config';
import { buildReceiptPdf } from '../lib/payments/receiptPdf';
import { paymentConfirmationEmail } from '../lib/payments/emails';

// RECEIPTS (F-29) — PDF composition and confirmation email, Node runtime.
//
// Why Node: the receipt prints the payer's name in its script (joined
// Arabic, Vietnamese…), which requires embedded fonts and the OpenType
// shaping of pdfkit + fontkit, which rely on Node's streams and zlib
// (convex/lib/payments/receiptPdf.ts). Only the COMPOSITION is here:
// the receipt number is assigned in the payment transaction
// (convex/lib/payments/ledger.ts), which schedules this action; reading the
// data and recording the file remain functions of the default
// runtime (./receipts.ts). Replayable: a receipt already produced is not redone.

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

    // Confirmation email: a failure (no email provider) undoes
    // nothing — the payment and the receipt exist, the receipt stays in the member
    // area and in the back-office.
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

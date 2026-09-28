import type { Currency } from './amounts';
import type { SiteLocale } from '../locales';
import type { NormalizedEvent, PaymentPurpose, ProviderId } from './validators';

// CONTRACT OF A PAYMENT ADAPTER.
//
// The payment layer is PROVIDER-INDEPENDENT: the ledger
// (convex/payments/webhooks.ts) only knows this contract and the normalised
// events. An adapter does three things — open a hosted payment, VERIFY what
// its provider sends it, and (if it can) cancel a recurring debit or refund.
// It never writes to the database.

export type CheckoutRequest = {
  ref: string;
  purpose: PaymentPurpose;
  currency: Currency;
  amountMinor: number;
  recurring: boolean;
  description: string;
  email: string;
  name?: string;
  locale: SiteLocale;
  successUrl: string;
  cancelUrl: string;
  webhookUrl: string;
};

export type CheckoutResult = {
  providerSessionId: string;
  // Absolute for a real provider; relative to the site for the fake one (the
  // simulation page lives on the site itself, whatever its port).
  redirectUrl: string;
};

export type HeaderReader = (name: string) => string | null;

export type WebhookParseResult =
  | { ok: true; eventId: string; type: string; events: NormalizedEvent[] }
  | { ok: false; reason: string };

export type RefundTarget = {
  providerPaymentId: string;
  providerRef?: string;
};

export interface PaymentAdapter {
  readonly id: ProviderId;
  readonly currencies: readonly Currency[];
  // Does the provider debit by itself every month? If not, the monthly
  // donation goes through a scheduled reminder (payment link sent on the due
  // date).
  readonly nativeSubscriptions: boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Verifies (signature, hash, server-to-server confirmation) THEN translates.
   *  Any unauthenticated request returns `ok: false`. */
  parseWebhook(
    rawBody: string,
    header: HeaderReader,
  ): Promise<WebhookParseResult>;
  /** Re-reads a payment's status at the provider (payment return, missed
   *  webhook). Same events, same idempotency. */
  fetchCheckout?(providerSessionId: string): Promise<NormalizedEvent[]>;
  cancelSubscription?(providerSubscriptionId: string): Promise<void>;
  /** Absent = the provider offers no refund via API: the back office MARKS
   *  the refund, which is carried out manually. */
  refund?(target: RefundTarget): Promise<boolean>;
}

export class PaymentProviderError extends Error {
  constructor(
    readonly provider: ProviderId,
    message: string,
  ) {
    super(`[${provider}] ${message}`);
  }
}

import type { NormalizedEvent } from './validators';
import { hmacSha256Hex, timingSafeEqual } from './crypto';
import { fakeProviderState, fakeWebhookSecret } from './config';
import type {
  CheckoutRequest,
  HeaderReader,
  PaymentAdapter,
  WebhookParseResult,
} from './types';
import { CURRENCIES, isCurrency } from './amounts';

// FAKE PROVIDER — development and E2E ONLY (guard: `fakeProvider
// State()` in ./config.ts).
//
// It does NOT short-circuit the pipeline: it plays it. The "payment" is a page
// of the site (/paiement/simulateur); confirming there produces a SIGNED
// webhook (HMAC-SHA256, `x-fake-signature` header) that goes through the same
// verification and the same ledger as a Stripe webhook. What an E2E test
// proves with it — idempotency, receipt, member area, back office — therefore
// holds for the real providers, up to the translation of the event.

export const FAKE_SIGNATURE_HEADER = 'x-fake-signature';

export type FakeWebhookPayload = {
  id: string;
  type: 'payment.succeeded' | 'payment.cancelled';
  ref: string;
  paymentId: string;
  amountMinor: number;
  currency: string;
  paidAt: number;
};

export async function signFakePayload(rawBody: string): Promise<string> {
  return await hmacSha256Hex(fakeWebhookSecret(), rawBody);
}

export const fakeAdapter: PaymentAdapter = {
  id: 'fake',
  currencies: CURRENCIES,
  // No automatic debit: the fake monthly donation follows the reminder path,
  // the one a provider without subscriptions would take (mobile money);
  // Stripe, on the other hand, debits (see the `stripe.ts` tests).
  nativeSubscriptions: false,

  async createCheckout(req: CheckoutRequest) {
    if (fakeProviderState() !== 'active') {
      throw new Error('FAKE_PROVIDER_DISABLED');
    }
    return {
      providerSessionId: `fake_${req.ref}`,
      redirectUrl: `/${req.locale}/paiement/simulateur?ref=${encodeURIComponent(req.ref)}`,
    };
  },

  async parseWebhook(
    rawBody: string,
    header: HeaderReader,
  ): Promise<WebhookParseResult> {
    // Guard BEFORE any read: when disabled, the endpoint accepts nothing, not even
    // a request correctly signed with the default secret.
    if (fakeProviderState() !== 'active')
      return { ok: false, reason: 'disabled' };
    const signature = header(FAKE_SIGNATURE_HEADER);
    if (!signature) return { ok: false, reason: 'missing-signature' };
    const expected = await signFakePayload(rawBody);
    if (!timingSafeEqual(signature, expected)) {
      return { ok: false, reason: 'bad-signature' };
    }
    let p: FakeWebhookPayload;
    try {
      p = JSON.parse(rawBody) as FakeWebhookPayload;
    } catch {
      return { ok: false, reason: 'invalid-json' };
    }
    if (typeof p.id !== 'string' || typeof p.ref !== 'string') {
      return { ok: false, reason: 'invalid-event' };
    }
    const events: NormalizedEvent[] = [];
    if (p.type === 'payment.succeeded' && isCurrency(p.currency)) {
      events.push({
        kind: 'payment_succeeded',
        providerPaymentId: p.paymentId,
        checkoutRef: p.ref,
        amountMinor: p.amountMinor,
        currency: p.currency,
        paidAt: p.paidAt,
        providerRef: p.paymentId,
      });
    } else if (p.type === 'payment.cancelled') {
      events.push({
        kind: 'checkout_closed',
        checkoutRef: p.ref,
        outcome: 'cancelled',
      });
    }
    return { ok: true, eventId: p.id, type: p.type, events };
  },

  // The fake "refund" always succeeds: it exercises the back-office path that
  // calls the provider.
  async refund() {
    return fakeProviderState() === 'active';
  },
};

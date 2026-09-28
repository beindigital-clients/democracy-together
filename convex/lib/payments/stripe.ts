import type { NormalizedEvent } from './validators';
import { hmacSha256Hex, timingSafeEqual } from './crypto';
import {
  PaymentProviderError,
  type CheckoutRequest,
  type HeaderReader,
  type PaymentAdapter,
  type RefundTarget,
  type WebhookParseResult,
} from './types';
import type { SiteLocale } from '../locales';
import { CURRENCIES, isCurrency, type Currency } from './amounts';

// STRIPE ADAPTER — euro and US dollar, with the same account.
//
// REST API via `fetch`, no SDK: the Node SDK would require `"use node"` (hence
// a separate actions file and a runtime slower to start) for three calls.
// HOSTED Stripe Checkout: no card data passes through the site, which keeps
// the PCI-DSS scope to a minimum (SAQ A).
//
// Subscriptions: `mode=subscription` with a monthly price created on the fly
// (`price_data.recurring`) — no product catalogue to maintain at Stripe for
// a free donation amount.

const API = 'https://api.stripe.com/v1';

// Tolerance for the signed timestamp (Stripe recommendation: 5 minutes).
// Beyond that, a captured signed request can no longer be replayed.
export const STRIPE_SIGNATURE_TOLERANCE_S = 300;

const STRIPE_LOCALES: Record<SiteLocale, string> = {
  fr: 'fr',
  en: 'en',
  es: 'es',
  pt: 'pt',
  // Stripe Checkout has no Arabic interface: `auto` follows the browser.
  ar: 'auto',
};

function secretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key)
    throw new PaymentProviderError('stripe', 'STRIPE_SECRET_KEY absente');
  return key;
}

async function stripeRequest(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params?: URLSearchParams,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey()}`,
  };
  if (params) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  // Stripe idempotency key: a retry after a network drop returns the SAME
  // session instead of opening a second one.
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: params ? params.toString() : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = body.error as { message?: string } | undefined;
    throw new PaymentProviderError(
      'stripe',
      `${method} ${path} → ${res.status} ${err?.message ?? ''}`.trim(),
    );
  }
  return body;
}

// --- Lenient reading of Stripe objects ---------------------------------------
//
// Fields have moved from one API version to another (2025: `invoice.
// subscription` moved under `invoice.parent.subscription_details`). We read
// both shapes rather than pinning a version: the association's Stripe account
// may be on either one.

type Obj = Record<string, unknown>;

function str(o: unknown, ...path: string[]): string | undefined {
  let cur: unknown = o;
  for (const k of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Obj)[k];
  }
  if (typeof cur === 'string') return cur;
  // "Expandable" field: an object carrying its `id`.
  if (cur && typeof cur === 'object' && typeof (cur as Obj).id === 'string') {
    return (cur as Obj).id as string;
  }
  return undefined;
}

function num(o: unknown, ...path: string[]): number | undefined {
  let cur: unknown = o;
  for (const k of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Obj)[k];
  }
  return typeof cur === 'number' ? cur : undefined;
}

// A currency unknown to the site (Stripe account settled in another currency
// by mistake) is not recorded: the ledger cannot total it.
function currencyOf(o: Obj): Currency | null {
  const c = str(o, 'currency')?.toUpperCase();
  return isCurrency(c) ? c : null;
}

/** Checkout session paid in payment mode → successful payment. */
export function eventsFromCheckoutSession(
  session: Obj,
  paidAt: number,
): NormalizedEvent[] {
  const ref =
    str(session, 'client_reference_id') ??
    str(session, 'metadata', 'checkoutRef');
  const mode = str(session, 'mode');
  const status = str(session, 'status');
  const paymentStatus = str(session, 'payment_status');
  const id = str(session, 'id');
  if (!id || !ref) return [];

  if (status === 'expired') {
    return [{ kind: 'checkout_closed', checkoutRef: ref, outcome: 'expired' }];
  }
  if (status !== 'complete') return [];

  if (mode === 'subscription') {
    const subId = str(session, 'subscription');
    return subId
      ? [
          {
            kind: 'subscription_started',
            checkoutRef: ref,
            providerSubscriptionId: subId,
          },
        ]
      : [];
  }
  // Delayed payment methods (SEPA…): the session is `complete` but the money
  // is not there. We wait for `async_payment_succeeded`.
  if (paymentStatus !== 'paid') return [];
  const amount = num(session, 'amount_total');
  const currency = currencyOf(session);
  if (amount === undefined || !currency) return [];
  return [
    {
      kind: 'payment_succeeded',
      providerPaymentId: id,
      checkoutRef: ref,
      amountMinor: amount,
      currency,
      paidAt,
      providerRef: str(session, 'payment_intent'),
    },
  ];
}

/** Paid subscription invoice → one monthly donation instalment. */
export function eventsFromInvoice(
  invoice: Obj,
  paidAt: number,
): NormalizedEvent[] {
  const id = str(invoice, 'id');
  const amount = num(invoice, 'amount_paid');
  const currency = currencyOf(invoice);
  if (!id || amount === undefined || amount <= 0 || !currency) return [];
  const subId =
    str(invoice, 'subscription') ??
    str(invoice, 'parent', 'subscription_details', 'subscription');
  const ref =
    str(invoice, 'subscription_details', 'metadata', 'checkoutRef') ??
    str(invoice, 'parent', 'subscription_details', 'metadata', 'checkoutRef');
  if (!subId && !ref) return [];
  return [
    {
      kind: 'payment_succeeded',
      providerPaymentId: id,
      checkoutRef: ref,
      providerSubscriptionId: subId,
      amountMinor: amount,
      currency,
      paidAt,
      providerRef: str(invoice, 'payment_intent'),
    },
  ];
}

/** Translates an ALREADY AUTHENTICATED Stripe event. */
export function translateStripeEvent(event: Obj): NormalizedEvent[] {
  const type = str(event, 'type') ?? '';
  const object = ((event.data as Obj | undefined)?.object ?? {}) as Obj;
  const created = num(event, 'created');
  const at = created ? created * 1000 : Date.now();
  switch (type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.expired':
      return eventsFromCheckoutSession(object, at);
    case 'checkout.session.async_payment_failed': {
      const ref =
        str(object, 'client_reference_id') ??
        str(object, 'metadata', 'checkoutRef');
      return ref
        ? [{ kind: 'checkout_closed', checkoutRef: ref, outcome: 'failed' }]
        : [];
    }
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      return eventsFromInvoice(object, at);
    case 'customer.subscription.deleted': {
      const id = str(object, 'id');
      return id
        ? [{ kind: 'subscription_cancelled', providerSubscriptionId: id }]
        : [];
    }
    case 'charge.refunded': {
      // FULL refund only: a partial refund does not change the transaction status
      // (it is handled manually).
      if (object.refunded !== true) return [];
      const pi = str(object, 'payment_intent');
      const invoice = str(object, 'invoice');
      return [
        {
          kind: 'refunded',
          providerRef: pi,
          providerPaymentId: invoice,
        },
      ];
    }
    default:
      return [];
  }
}

/**
 * Verifies the `Stripe-Signature` header (v1 scheme): HMAC-SHA256 of the
 * webhook secret over `${t}.${raw body}`, and timestamp within tolerance.
 * Exported for tests (injectable `now` value).
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowMs: number = Date.now(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!header) return { ok: false, reason: 'missing-signature' };
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.trim().split('=', 2);
    if (k === 't') timestamp = v ?? null;
    else if (k === 'v1' && v) signatures.push(v);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    return { ok: false, reason: 'malformed-signature' };
  }
  const age = Math.abs(nowMs / 1000 - Number(timestamp));
  if (age > STRIPE_SIGNATURE_TOLERANCE_S) {
    return { ok: false, reason: 'timestamp-out-of-tolerance' };
  }
  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  // Several `v1` values coexist during a secret rotation: only one needs to
  // match.
  if (!signatures.some((s) => timingSafeEqual(s, expected))) {
    return { ok: false, reason: 'bad-signature' };
  }
  return { ok: true };
}

export const stripeAdapter: PaymentAdapter = {
  id: 'stripe',
  currencies: CURRENCIES,
  nativeSubscriptions: true,

  async createCheckout(req: CheckoutRequest) {
    const p = new URLSearchParams();
    p.set('mode', req.recurring ? 'subscription' : 'payment');
    p.set('success_url', req.successUrl);
    p.set('cancel_url', req.cancelUrl);
    p.set('client_reference_id', req.ref);
    p.set('customer_email', req.email);
    p.set('locale', STRIPE_LOCALES[req.locale]);
    p.set('metadata[checkoutRef]', req.ref);
    p.set('metadata[purpose]', req.purpose);
    p.set('line_items[0][quantity]', '1');
    p.set('line_items[0][price_data][currency]', req.currency.toLowerCase());
    p.set('line_items[0][price_data][unit_amount]', String(req.amountMinor));
    p.set('line_items[0][price_data][product_data][name]', req.description);
    if (req.recurring) {
      p.set('line_items[0][price_data][recurring][interval]', 'month');
      // Copied onto the subscription: each monthly invoice can thus find its
      // original request, even if it arrives before `checkout.session.completed`.
      p.set('subscription_data[metadata][checkoutRef]', req.ref);
    } else {
      p.set('payment_intent_data[metadata][checkoutRef]', req.ref);
    }
    const session = await stripeRequest(
      'POST',
      '/checkout/sessions',
      p,
      `checkout-${req.ref}`,
    );
    const id = str(session, 'id');
    const url = str(session, 'url');
    if (!id || !url) {
      throw new PaymentProviderError('stripe', 'session sans id ni url');
    }
    return { providerSessionId: id, redirectUrl: url };
  },

  async parseWebhook(
    rawBody: string,
    header: HeaderReader,
  ): Promise<WebhookParseResult> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return { ok: false, reason: 'not-configured' };
    const verdict = await verifyStripeSignature(
      rawBody,
      header('stripe-signature'),
      secret,
    );
    if (!verdict.ok) return verdict;
    let event: Obj;
    try {
      event = JSON.parse(rawBody) as Obj;
    } catch {
      return { ok: false, reason: 'invalid-json' };
    }
    const id = str(event, 'id');
    const type = str(event, 'type');
    if (!id || !type) return { ok: false, reason: 'invalid-event' };
    return { ok: true, eventId: id, type, events: translateStripeEvent(event) };
  },

  async fetchCheckout(sessionId: string) {
    const session = await stripeRequest(
      'GET',
      `/checkout/sessions/${encodeURIComponent(sessionId)}`,
    );
    const events = eventsFromCheckoutSession(session, Date.now());
    // Subscription: the first instalment is an INVOICE. We re-read it to produce
    // the same event (same idempotency key) as `invoice.paid`.
    const invoiceId = str(session, 'invoice');
    if (str(session, 'mode') === 'subscription' && invoiceId) {
      const invoice = await stripeRequest(
        'GET',
        `/invoices/${encodeURIComponent(invoiceId)}`,
      );
      if (str(invoice, 'status') === 'paid') {
        events.push(...eventsFromInvoice(invoice, Date.now()));
      }
    }
    return events;
  },

  async cancelSubscription(providerSubscriptionId: string) {
    await stripeRequest(
      'DELETE',
      `/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,
    );
  },

  async refund(target: RefundTarget) {
    // Refund via the payment intent; a subscription instalment for which Stripe
    // did not give us the intent cannot be refunded from here.
    if (!target.providerRef) return false;
    const p = new URLSearchParams();
    p.set('payment_intent', target.providerRef);
    await stripeRequest(
      'POST',
      '/refunds',
      p,
      `refund-${target.providerPaymentId}`,
    );
    return true;
  },
};

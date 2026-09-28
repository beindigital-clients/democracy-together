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

// ADAPTATEUR STRIPE — euro et dollar des États-Unis, avec le même compte.
//
// API REST par `fetch`, sans SDK : le SDK Node imposerait `"use node"` (donc un
// fichier d'actions à part et un runtime plus lent à démarrer) pour trois
// appels. Stripe Checkout HÉBERGÉ : aucune donnée de carte ne transite par le
// site, ce qui garde le périmètre PCI-DSS au minimum (SAQ A).
//
// Abonnements : `mode=subscription` avec un prix mensuel créé à la volée
// (`price_data.recurring`) — pas de catalogue de produits à maintenir chez
// Stripe pour un montant de don libre.

const API = 'https://api.stripe.com/v1';

// Tolérance de l'horodatage signé (recommandation Stripe : 5 minutes). Au-delà,
// une requête signée capturée ne peut plus être rejouée.
export const STRIPE_SIGNATURE_TOLERANCE_S = 300;

const STRIPE_LOCALES: Record<SiteLocale, string> = {
  fr: 'fr',
  en: 'en',
  es: 'es',
  pt: 'pt',
  // Stripe Checkout n'a pas d'interface arabe : `auto` suit le navigateur.
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
  // Clé d'idempotence Stripe : un nouvel essai après une coupure réseau
  // rend la MÊME session au lieu d'en ouvrir une seconde.
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

// --- Lecture tolérante des objets Stripe -------------------------------------
//
// Les champs ont bougé d'une version d'API à l'autre (2025 : `invoice.
// subscription` est passé sous `invoice.parent.subscription_details`). On lit
// les deux formes plutôt que d'épingler une version : le compte Stripe de
// l'association peut être sur l'une ou l'autre.

type Obj = Record<string, unknown>;

function str(o: unknown, ...path: string[]): string | undefined {
  let cur: unknown = o;
  for (const k of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Obj)[k];
  }
  if (typeof cur === 'string') return cur;
  // Champ « expansible » : un objet portant son `id`.
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

// Une devise inconnue du site (compte Stripe réglé dans une autre devise par
// erreur) n'est pas enregistrée : le grand livre ne sait pas la totaliser.
function currencyOf(o: Obj): Currency | null {
  const c = str(o, 'currency')?.toUpperCase();
  return isCurrency(c) ? c : null;
}

/** Session Checkout payée en mode paiement → paiement réussi. */
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
  // Moyens de paiement différés (SEPA…) : la session est `complete` mais
  // l'argent n'est pas là. On attend `async_payment_succeeded`.
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

/** Facture d'abonnement payée → une échéance de don mensuel. */
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

/** Traduit un événement Stripe DÉJÀ AUTHENTIFIÉ. */
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
      // Remboursement TOTAL uniquement : un remboursement partiel ne change
      // pas le statut de la transaction (il se traite à la main).
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
 * Vérifie l'en-tête `Stripe-Signature` (schéma v1) : HMAC-SHA256 du secret de
 * webhook sur `${t}.${corps brut}`, et horodatage dans la tolérance.
 * Exportée pour les tests (valeur `now` injectable).
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
  // Plusieurs `v1` coexistent pendant une rotation de secret : un seul doit
  // correspondre.
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
      // Recopiée sur l'abonnement : chaque facture mensuelle retrouve ainsi sa
      // demande d'origine, même si elle arrive avant `checkout.session.completed`.
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
    // Abonnement : la première échéance est une FACTURE. On la relit pour
    // produire le même événement (même clé d'idempotence) que `invoice.paid`.
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
    // Remboursement par l'intention de paiement ; une échéance d'abonnement
    // dont Stripe ne nous a pas donné l'intention ne se rembourse pas d'ici.
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

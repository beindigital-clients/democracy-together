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

// PRESTATAIRE FACTICE — développement et E2E UNIQUEMENT (garde : `fakeProvider
// State()` dans ./config.ts).
//
// Il ne court-circuite PAS la chaîne : il la joue. Le « paiement » est une page
// du site (/paiement/simulateur) ; valider y fabrique un webhook SIGNÉ
// (HMAC-SHA256, en-tête `x-fake-signature`) qui passe par la même vérification
// et le même grand livre qu'un webhook Stripe. Ce qu'un E2E prouve avec lui —
// idempotence, reçu, espace membre, back-office — vaut donc pour les vrais
// prestataires, à la traduction de l'événement près.

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
  // Pas de prélèvement automatique : le don mensuel factice suit le chemin des
  // relances, celui que prendrait un prestataire sans abonnements (mobile
  // money) ; Stripe, lui, prélève (tests de `stripe.ts`).
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
    // Garde AVANT toute lecture : désactivé, le point d'entrée n'accepte rien,
    // même une requête correctement signée avec le secret par défaut.
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

  // Le « remboursement » factice réussit toujours : il exerce le chemin du
  // back-office qui appelle le prestataire.
  async refund() {
    return fakeProviderState() === 'active';
  },
};

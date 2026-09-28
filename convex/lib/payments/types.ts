import type { Currency } from './amounts';
import type { SiteLocale } from '../locales';
import type { NormalizedEvent, PaymentPurpose, ProviderId } from './validators';

// CONTRAT D'UN ADAPTATEUR DE PAIEMENT.
//
// La couche de paiement est INDÉPENDANTE du prestataire : le grand livre
// (convex/payments/webhooks.ts) ne connaît que ce contrat et les événements
// normalisés. Un adaptateur fait trois choses — ouvrir un paiement hébergé,
// VÉRIFIER ce que son prestataire lui envoie, et (s'il le sait) annuler un
// prélèvement ou rembourser. Il n'écrit jamais en base.

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
  // Absolue pour un prestataire réel ; relative au site pour le factice (la
  // page de simulation vit sur le site lui-même, quel que soit son port).
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
  // Le prestataire prélève-t-il lui-même chaque mois ? Sinon, le don mensuel
  // passe par une relance planifiée (lien de paiement envoyé à l'échéance).
  readonly nativeSubscriptions: boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Vérifie (signature, hash, confirmation serveur à serveur) PUIS traduit.
   *  Toute requête non authentifiée rend `ok: false`. */
  parseWebhook(
    rawBody: string,
    header: HeaderReader,
  ): Promise<WebhookParseResult>;
  /** Relit l'état d'un paiement chez le prestataire (retour de paiement,
   *  webhook manqué). Mêmes événements, même idempotence. */
  fetchCheckout?(providerSessionId: string): Promise<NormalizedEvent[]>;
  cancelSubscription?(providerSubscriptionId: string): Promise<void>;
  /** Absent = le prestataire n'offre pas de remboursement par API : le
   *  back-office MARQUE le remboursement, effectué à la main. */
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

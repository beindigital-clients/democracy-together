import { v, type Infer } from 'convex/values';

// Validateurs partagés par les tables (convex/lib/tables/paiements.ts) et les
// fonctions de paiement. Module séparé pour ne pas créer de cycle d'imports
// entre le schéma et les modules qui l'importent (même raison que
// convex/lib/locales.ts).

export const currencyValidator = v.union(v.literal('EUR'), v.literal('XOF'));

export const providerIdValidator = v.union(
  v.literal('stripe'),
  v.literal('paydunya'),
  v.literal('fake'),
);
export type ProviderId = Infer<typeof providerIdValidator>;

export const paymentPurposeValidator = v.union(
  v.literal('donation'),
  v.literal('dues'),
);
export type PaymentPurpose = Infer<typeof paymentPurposeValidator>;

export const planCategoryValidator = v.union(
  v.literal('org'),
  v.literal('ind'),
  v.literal('jeu'),
);
export const planZoneValidator = v.union(
  v.literal('high'),
  v.literal('mid'),
  v.literal('low'),
);

export const checkoutStatusValidator = v.union(
  // créé en base, pas encore ouvert chez le prestataire
  v.literal('created'),
  // session ouverte chez le prestataire, paiement attendu
  v.literal('open'),
  v.literal('completed'),
  v.literal('cancelled'),
  v.literal('expired'),
  v.literal('failed'),
);

export const transactionStatusValidator = v.union(
  v.literal('succeeded'),
  v.literal('refunded'),
);

export const subscriptionModeValidator = v.union(
  // le prestataire prélève lui-même chaque mois (Stripe Billing)
  v.literal('native'),
  // le prestataire ne sait pas prélever : un lien de paiement est envoyé à
  // chaque échéance (PayDunya, prestataire factice)
  v.literal('reminder'),
);

export const subscriptionStatusValidator = v.union(
  v.literal('active'),
  v.literal('cancelled'),
  // relances restées sans paiement : l'engagement est suspendu
  v.literal('past_due'),
);

// ÉVÉNEMENT NORMALISÉ — ce que chaque adaptateur rend après avoir VÉRIFIÉ la
// requête de son prestataire. Le cœur comptable (convex/payments/webhooks.ts)
// ne connaît que cette forme : ajouter un prestataire ne touche pas au grand
// livre.
export const normalizedEventValidator = v.union(
  v.object({
    kind: v.literal('payment_succeeded'),
    // Clé d'idempotence : identifiant du PAIEMENT chez le prestataire (session
    // Stripe, facture Stripe d'un abonnement, jeton de facture PayDunya). Deux
    // événements qui portent la même clé sont le même paiement.
    providerPaymentId: v.string(),
    checkoutRef: v.optional(v.string()),
    providerSubscriptionId: v.optional(v.string()),
    amountMinor: v.number(),
    currency: currencyValidator,
    paidAt: v.number(),
    // Référence utile au remboursement (payment_intent Stripe).
    providerRef: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('checkout_closed'),
    checkoutRef: v.optional(v.string()),
    providerSessionId: v.optional(v.string()),
    outcome: v.union(
      v.literal('cancelled'),
      v.literal('expired'),
      v.literal('failed'),
    ),
  }),
  v.object({
    kind: v.literal('subscription_started'),
    checkoutRef: v.string(),
    providerSubscriptionId: v.string(),
  }),
  v.object({
    kind: v.literal('subscription_cancelled'),
    providerSubscriptionId: v.string(),
  }),
  v.object({
    kind: v.literal('refunded'),
    // L'un ou l'autre selon ce que le prestataire renvoie.
    providerPaymentId: v.optional(v.string()),
    providerRef: v.optional(v.string()),
  }),
);
export type NormalizedEvent = Infer<typeof normalizedEventValidator>;

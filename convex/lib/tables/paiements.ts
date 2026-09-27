import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { locale } from '../locales';
import {
  checkoutStatusValidator,
  currencyValidator,
  paymentPurposeValidator,
  planCategoryValidator,
  planZoneValidator,
  providerIdValidator,
  subscriptionModeValidator,
  subscriptionStatusValidator,
  transactionStatusValidator,
} from '../payments/validators';

// PAIEMENTS (F-27 à F-31) — cotisations, dons, reçus, suivi financier.
//
// Tous les montants sont des ENTIERS en unité mineure de leur devise (cf.
// convex/lib/payments/amounts.ts). Les documents financiers ne se suppriment
// pas : un remboursement change un statut, il n'efface pas la ligne — la
// comptabilité doit pouvoir rejouer chaque mois tel qu'il a été encaissé.
export const paiementsTables = {
  // Barème des formules d'adhésion (F-27) : une ligne par (catégorie, zone de
  // revenu), un montant par devise. Édité par l'administrateur ; c'est LUI que
  // lit la page d'adhésion et que facture l'espace membre — jamais un montant
  // venu du navigateur.
  paymentPlans: defineTable({
    category: planCategoryValidator,
    zone: planZoneValidator,
    // Unités mineures ; absent = formule non proposée dans cette devise.
    amountEur: v.optional(v.number()),
    amountXof: v.optional(v.number()),
    active: v.boolean(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id('users')),
  }).index('by_category_and_zone', ['category', 'zone']),

  // Intention de paiement : ce qui a été demandé AVANT de partir chez le
  // prestataire. `ref` est un jeton aléatoire, public (il voyage dans les URL
  // de retour et dans les métadonnées du prestataire) mais non devinable.
  // Le don ou la cotisation n'est créé qu'au paiement CONFIRMÉ par webhook.
  paymentCheckouts: defineTable({
    ref: v.string(),
    provider: providerIdValidator,
    purpose: paymentPurposeValidator,
    currency: currencyValidator,
    amountMinor: v.number(),
    recurring: v.boolean(),
    status: checkoutStatusValidator,
    providerSessionId: v.optional(v.string()),
    userId: v.optional(v.id('users')),
    email: v.string(),
    name: v.optional(v.string()),
    anonymous: v.optional(v.boolean()),
    message: v.optional(v.string()),
    locale,
    // Cotisation : formule facturée (le montant est recopié ci-dessus au
    // moment de la demande, pour qu'une retouche du barème ne change pas un
    // paiement en cours).
    planId: v.optional(v.id('paymentPlans')),
    category: v.optional(planCategoryValidator),
    zone: v.optional(planZoneValidator),
    orgId: v.optional(v.id('organizations')),
    // Relance d'un don récurrent sans prélèvement automatique.
    subscriptionId: v.optional(v.id('paymentSubscriptions')),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index('by_ref', ['ref'])
    .index('by_provider_and_session', ['provider', 'providerSessionId']),

  // Mouvements d'argent. L'index `by_provider_and_payment` est la GARDE
  // D'IDEMPOTENCE : un webhook rejoué retrouve sa ligne et ne crée rien.
  paymentTransactions: defineTable({
    provider: providerIdValidator,
    providerPaymentId: v.string(),
    providerRef: v.optional(v.string()),
    kind: paymentPurposeValidator,
    currency: currencyValidator,
    amountMinor: v.number(),
    status: transactionStatusValidator,
    userId: v.optional(v.id('users')),
    email: v.string(),
    name: v.optional(v.string()),
    donationId: v.optional(v.id('donations')),
    duesId: v.optional(v.id('membershipDues')),
    subscriptionId: v.optional(v.id('paymentSubscriptions')),
    checkoutId: v.id('paymentCheckouts'),
    receiptId: v.optional(v.id('paymentReceipts')),
    paidAt: v.number(),
    // Mois comptable « AAAA-MM » (UTC), clé des totaux mensuels.
    month: v.string(),
    refundedAt: v.optional(v.number()),
    refundedBy: v.optional(v.id('users')),
    refundReason: v.optional(v.string()),
    // Vrai quand le remboursement a été exécuté chez le prestataire ; faux
    // quand il a seulement été MARQUÉ (virement manuel, prestataire sans API).
    refundedAtProvider: v.optional(v.boolean()),
  })
    .index('by_provider_and_payment', ['provider', 'providerPaymentId'])
    .index('by_provider_and_ref', ['provider', 'providerRef'])
    .index('by_user_and_paidAt', ['userId', 'paidAt'])
    .index('by_paidAt', ['paidAt'])
    .index('by_subscription', ['subscriptionId']),

  // Totaux mensuels, tenus dans la transaction qui écrit le paiement (même
  // motif que `counters`) : le tableau de bord lit une ligne par (mois,
  // devise, type) au lieu de relire tous les paiements.
  paymentMonthlyTotals: defineTable({
    month: v.string(),
    currency: currencyValidator,
    kind: paymentPurposeValidator,
    grossMinor: v.number(),
    refundedMinor: v.number(),
    count: v.number(),
  })
    .index('by_month', ['month'])
    .index('by_month_and_currency_and_kind', ['month', 'currency', 'kind']),

  // Dons (F-28). Un don ponctuel = une ligne, un paiement. Un don mensuel =
  // une ligne (l'engagement) et autant de transactions que d'échéances.
  // `anonymous` : le donateur ne veut pas être nommé publiquement ; le reçu,
  // document privé, porte toujours son nom.
  donations: defineTable({
    donorUserId: v.optional(v.id('users')),
    email: v.string(),
    name: v.optional(v.string()),
    anonymous: v.boolean(),
    kind: v.union(v.literal('one_time'), v.literal('monthly')),
    currency: currencyValidator,
    amountMinor: v.number(),
    message: v.optional(v.string()),
    status: v.union(
      v.literal('paid'),
      v.literal('active'),
      v.literal('cancelled'),
      v.literal('refunded'),
    ),
    subscriptionId: v.optional(v.id('paymentSubscriptions')),
    checkoutId: v.id('paymentCheckouts'),
    createdAt: v.number(),
  })
    .index('by_donor', ['donorUserId'])
    .index('by_checkout', ['checkoutId']),

  // Cotisations (F-27/F-30) : une ligne par période réglée.
  membershipDues: defineTable({
    payerUserId: v.id('users'),
    orgId: v.optional(v.id('organizations')),
    planId: v.optional(v.id('paymentPlans')),
    category: planCategoryValidator,
    zone: planZoneValidator,
    currency: currencyValidator,
    amountMinor: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
    status: v.union(v.literal('paid'), v.literal('refunded')),
    transactionId: v.id('paymentTransactions'),
    createdAt: v.number(),
  })
    .index('by_payer_and_periodEnd', ['payerUserId', 'periodEnd'])
    .index('by_status_and_periodEnd', ['status', 'periodEnd']),

  // Dons récurrents : la mécanique d'échéance, séparée de l'engagement.
  paymentSubscriptions: defineTable({
    provider: providerIdValidator,
    mode: subscriptionModeValidator,
    providerSubscriptionId: v.optional(v.string()),
    checkoutId: v.id('paymentCheckouts'),
    donationId: v.optional(v.id('donations')),
    userId: v.optional(v.id('users')),
    email: v.string(),
    name: v.optional(v.string()),
    locale,
    currency: currencyValidator,
    amountMinor: v.number(),
    status: subscriptionStatusValidator,
    // Prochaine échéance (mode relance : date d'envoi du lien de paiement).
    nextDueAt: v.number(),
    lastPaidAt: v.optional(v.number()),
    reminderCount: v.number(),
    lastReminderAt: v.optional(v.number()),
    createdAt: v.number(),
    cancelledAt: v.optional(v.number()),
  })
    .index('by_provider_and_subscription', [
      'provider',
      'providerSubscriptionId',
    ])
    .index('by_checkout', ['checkoutId'])
    .index('by_user', ['userId'])
    .index('by_status_and_nextDueAt', ['status', 'nextDueAt']),

  // Reçus (F-29). Numéro `DT-AAAA-NNNNNN`, attribué dans la MÊME transaction
  // que le paiement : un paiement sans reçu ou un numéro sans paiement ne
  // peuvent pas exister, donc la suite n'a pas de trou. Le PDF est produit
  // ensuite ; s'il échoue, le numéro reste attribué et le fichier se régénère.
  // `accessToken` : lien de téléchargement envoyé par courriel au payeur, qui
  // peut ne pas avoir de compte (don d'un visiteur).
  paymentReceipts: defineTable({
    year: v.number(),
    sequence: v.number(),
    number: v.string(),
    transactionId: v.id('paymentTransactions'),
    userId: v.optional(v.id('users')),
    email: v.string(),
    accessToken: v.string(),
    storageId: v.optional(v.id('_storage')),
    generatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_transaction', ['transactionId'])
    .index('by_token', ['accessToken'])
    .index('by_user', ['userId'])
    .index('by_year_and_sequence', ['year', 'sequence']),

  // Compteur de numérotation, un document par année.
  paymentReceiptSequences: defineTable({
    year: v.number(),
    lastSequence: v.number(),
  }).index('by_year', ['year']),

  // Événements de webhook déjà traités (premier filet d'idempotence, et trace
  // de ce que le prestataire a envoyé). Le second filet — décisif — est
  // l'index d'idempotence des transactions.
  paymentWebhookEvents: defineTable({
    provider: providerIdValidator,
    eventId: v.string(),
    type: v.string(),
    receivedAt: v.number(),
  }).index('by_provider_and_event', ['provider', 'eventId']),
};

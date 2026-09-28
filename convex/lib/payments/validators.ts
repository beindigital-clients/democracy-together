import { v, type Infer } from 'convex/values';

// Validators shared by the tables (convex/lib/tables/paiements.ts) and the
// payment functions. Separate module to avoid an import cycle between the
// schema and the modules that import it (same reason as
// convex/lib/locales.ts).

export const currencyValidator = v.union(v.literal('EUR'), v.literal('USD'));

export const providerIdValidator = v.union(
  v.literal('stripe'),
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
  // created in the database, not yet opened at the provider
  v.literal('created'),
  // session opened at the provider, payment pending
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
  // the provider debits by itself every month (Stripe Billing)
  v.literal('native'),
  // the provider cannot debit: a payment link is sent at each due date (fake
  // provider today)
  v.literal('reminder'),
);

export const subscriptionStatusValidator = v.union(
  v.literal('active'),
  v.literal('cancelled'),
  // reminders left unpaid: the pledge is suspended
  v.literal('past_due'),
);

// NORMALISED EVENT — what each adapter returns after VERIFYING its provider's
// request. The accounting core (convex/payments/webhooks.ts) only knows this
// shape: adding a provider does not touch the ledger.
export const normalizedEventValidator = v.union(
  v.object({
    kind: v.literal('payment_succeeded'),
    // Idempotency key: identifier of the PAYMENT at the provider (Stripe session,
    // Stripe invoice of a subscription, fake payment). Two events carrying the
    // same key are the same payment.
    providerPaymentId: v.string(),
    checkoutRef: v.optional(v.string()),
    providerSubscriptionId: v.optional(v.string()),
    amountMinor: v.number(),
    currency: currencyValidator,
    paidAt: v.number(),
    // Reference needed for refunds (Stripe payment_intent).
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
    // One or the other depending on what the provider returns.
    providerPaymentId: v.optional(v.string()),
    providerRef: v.optional(v.string()),
  }),
);
export type NormalizedEvent = Infer<typeof normalizedEventValidator>;

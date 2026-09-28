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

// PAYMENTS (F-27 to F-31) — membership fees, donations, receipts, financial
// tracking.
//
// All amounts are INTEGERS in their currency's minor unit (see
// convex/lib/payments/amounts.ts). Financial documents are not deleted: a
// refund changes a status, it does not erase the row — the accounts must be
// able to replay each month as it was collected.
export const paiementsTables = {
  // Membership plan price list (F-27): one row per (category, income zone), one
  // amount per currency. Edited by the administrator; it is what the membership
  // page reads and what the member area charges — never an amount coming from
  // the browser.
  paymentPlans: defineTable({
    category: planCategoryValidator,
    zone: planZoneValidator,
    // Minor units; absent = plan not offered in this currency.
    amountEur: v.optional(v.number()),
    amountUsd: v.optional(v.number()),
    active: v.boolean(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id('users')),
  }).index('by_category_and_zone', ['category', 'zone']),

  // Payment intent: what was requested BEFORE going to the provider. `ref` is a
  // random token, public (it travels in return URLs and in the provider's
  // metadata) but unguessable.
  // The donation or membership fee is only created when the payment is
  // CONFIRMED by webhook.
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
    // Membership fee: plan charged (the amount is copied above at request time,
    // so that a price list change does not alter a payment in progress).
    planId: v.optional(v.id('paymentPlans')),
    category: v.optional(planCategoryValidator),
    zone: v.optional(planZoneValidator),
    orgId: v.optional(v.id('organizations')),
    // Reminder for a recurring donation without automatic debit.
    subscriptionId: v.optional(v.id('paymentSubscriptions')),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index('by_ref', ['ref'])
    .index('by_provider_and_session', ['provider', 'providerSessionId']),

  // Money movements. The `by_provider_and_payment` index is the IDEMPOTENCY
  // GUARD: a replayed webhook finds its row and creates nothing.
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
    // Accounting month "AAAA-MM" (UTC), key of the monthly totals.
    month: v.string(),
    refundedAt: v.optional(v.number()),
    refundedBy: v.optional(v.id('users')),
    refundReason: v.optional(v.string()),
    // True when the refund was executed at the provider; false when it was only
    // MARKED (manual transfer, provider without an API).
    refundedAtProvider: v.optional(v.boolean()),
  })
    .index('by_provider_and_payment', ['provider', 'providerPaymentId'])
    .index('by_provider_and_ref', ['provider', 'providerRef'])
    .index('by_user_and_paidAt', ['userId', 'paidAt'])
    .index('by_paidAt', ['paidAt'])
    .index('by_subscription', ['subscriptionId']),

  // Monthly totals, maintained in the transaction that writes the payment (same
  // pattern as `counters`): the dashboard reads one row per (month, currency,
  // type) instead of re-reading every payment.
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

  // Donations (F-28). A one-off donation = one row, one payment. A monthly
  // donation = one row (the pledge) and as many transactions as instalments.
  // `anonymous`: the donor does not want to be named publicly; the receipt, a
  // private document, always carries their name.
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

  // Membership fees (F-27/F-30): one row per paid period.
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

  // Recurring donations: the instalment mechanics, separate from the pledge.
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
    // Next due date (reminder mode: date the payment link is sent).
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

  // Receipts (F-29). Number `DT-AAAA-NNNNNN`, assigned in the SAME transaction
  // as the payment: a payment without a receipt or a number without a payment
  // cannot exist, so the sequence has no gaps. The PDF is produced afterwards;
  // if it fails, the number stays assigned and the file is regenerated.
  // `accessToken`: download link e-mailed to the payer, who may not have an
  // account (donation from a visitor).
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

  // Numbering counter, one document per year.
  paymentReceiptSequences: defineTable({
    year: v.number(),
    lastSequence: v.number(),
  }).index('by_year', ['year']),

  // Webhook events already processed (first idempotency net, and a record of
  // what the provider sent). The second — decisive — net is the transactions'
  // idempotency index.
  paymentWebhookEvents: defineTable({
    provider: providerIdValidator,
    eventId: v.string(),
    type: v.string(),
    receivedAt: v.number(),
  }).index('by_provider_and_event', ['provider', 'eventId']),
};

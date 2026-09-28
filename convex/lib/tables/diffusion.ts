import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { locale } from '../locales';

// Tables of the "diffusion" workstream: bulk newsletter sending (F-65) and
// first-party audience measurement (F-66). Changes to EXISTING tables
// (subscribers, campaigns, search fields) are made in place in
// convex/schema.ts.

export const deliveryStatus = v.union(
  v.literal('queued'),
  v.literal('sending'),
  v.literal('sent'),
  v.literal('failed'),
  // Subscriber gone (unsubscribed, or back to pending) between queueing and
  // sending: we do not write to them, and we say so.
  v.literal('skipped'),
);

export const audienceDimension = v.union(
  v.literal('total'),
  v.literal('page'),
  v.literal('lang'),
  v.literal('referrer'),
  v.literal('screen'),
  // Number of distinct keys already created for (day, dimension) — used to
  // bound cardinality (see convex/audience.ts).
  v.literal('meta'),
);

export const diffusionTables = {
  // ONE STATUS PER RECIPIENT AND PER CAMPAIGN (F-65).
  //
  // No address here: the row points to the subscription, re-read at sending
  // time. A subscriber who unsubscribes while the campaign is going out is
  // therefore no longer served (`skipped`), and the table duplicates no
  // personal data.
  //
  // `claimId` identifies the BATCH that took charge of the row. It serves as
  // the idempotency key with the provider: a batch resumed after an
  // interruption is resent with the SAME key, and the provider returns the
  // original response instead of sending a second time.
  newsletterDeliveries: defineTable({
    campaignId: v.id('newsletterCampaigns'),
    subscriptionId: v.id('newsletterSubscriptions'),
    status: deliveryStatus,
    claimId: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    attempts: v.number(),
    locale: v.optional(locale),
    sentAt: v.optional(v.number()),
    providerId: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index('by_campaign_and_status', ['campaignId', 'status'])
    .index('by_campaign_and_subscription', ['campaignId', 'subscriptionId'])
    .index('by_claim', ['claimId']),

  // RAW AUDIENCE EVENTS — A BUFFER OF A FEW MINUTES (F-66).
  //
  // One page view = one insert, with no prior read: nothing contends, even at a
  // summit peak. A scheduled job aggregates them per day every five minutes
  // then DELETES them: no raw event lives longer than the aggregation interval
  // (plus a retry margin). No identifier, no IP, no user agent: nothing makes
  // it possible to link two rows to the same person.
  audienceEvents: defineTable({
    day: v.string(),
    path: v.string(),
    lang: v.optional(v.string()),
    referrer: v.optional(v.string()),
    screen: v.optional(v.string()),
    at: v.number(),
  }),

  // DAILY AGGREGATED COUNTERS — the only audience data retained.
  // One row per (dimension, day, key). Bounded retention
  // (`AUDIENCE_RETENTION_DAYS`, 395 days by default, i.e. 13 months).
  audienceDaily: defineTable({
    dimension: audienceDimension,
    day: v.string(),
    key: v.string(),
    count: v.number(),
  })
    .index('by_dimension_and_day_and_key', ['dimension', 'day', 'key'])
    .index('by_day', ['day']),

  // Anti-abuse for the public endpoint — one-minute windows, purged every five
  // minutes. A visitor's key is a salted HASH of their address block, never the
  // address: the salt changes every day and the old one is destroyed, which
  // makes the hash unusable beyond the day.
  audienceThrottle: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_windowStart', ['windowStart']),

  // Daily salt for the anti-abuse hash. Singleton (one row): replaced, and
  // therefore destroyed, at each change of day.
  audienceSalt: defineTable({
    day: v.string(),
    salt: v.string(),
  }),

  // DEV/TEST ONLY (AUTH_DEV_OTP guard) — simulated outbox: the newsletter
  // confirmation link is readable there by the E2E spec, like `devOtpCodes`
  // for sign-in codes. Never populated when AUTH_DEV_OTP is not 'true'; purged
  // after 24 h.
  devOutbox: defineTable({
    to: v.string(),
    kind: v.string(),
    subject: v.string(),
    link: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_to', ['to'])
    .index('by_createdAt', ['createdAt']),
};

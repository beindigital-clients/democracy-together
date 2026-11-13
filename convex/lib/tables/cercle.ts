import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { locale } from '../locales';

// Tables of the "Cercle des Amis" workstream. Changes to EXISTING tables (the
// `users` status fields) are made in place in convex/schema.ts.

export const cercleRequestStatus = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('rejected'),
);

export const cercleTables = {
  // A CV that went through the upload endpoint (convex/cercleHttp.ts) and has
  // not been attached to a request yet. The endpoint is anonymous, so it is
  // the one that checks size and PDF signature BEFORE storing anything; this
  // row is the proof that a storage id passed those checks. Attaching it to a
  // request DELETES the row (a CV cannot be reused for a second request); an
  // hourly job deletes the blob and the row of every CV left unclaimed.
  cercleUploads: defineTable({
    storageId: v.id('_storage'),
    createdAt: v.number(),
  })
    .index('by_storage', ['storageId'])
    .index('by_createdAt', ['createdAt']),

  // REQUEST TO JOIN THE CERCLE.
  //
  // The person has NO account (self-registration is closed): the row is keyed
  // by address, and a pending request gives NO access to anything — the
  // account only comes into existence when the president approves
  // (`cercle.reviewRequest`). Same shape of promise as the membership
  // applications, but a separate table: those grant the `membre` rank and a
  // directory profile, this one grants a status, and it is decided by an
  // administrator only. Mixing them would have put Cercle requests in the
  // moderators' queue.
  //
  // PERSONAL DATA, kept minimal. The CV is read by administrators only, to
  // decide. It is DELETED from storage when the request is refused
  // (`cvStorageId` removed, `cvDeletedAt` set). It stays on file for an
  // approved Ami, until the account is deleted.
  cercleRequests: defineTable({
    // Normalized address (lib/onboarding.ts `normalizeEmail`).
    email: v.string(),
    name: v.string(),
    country: v.optional(v.string()),
    motivation: v.optional(v.string()),
    locale: v.optional(locale),
    // The signed-in account that submitted, when there is one.
    applicantUserId: v.optional(v.id('users')),
    cvStorageId: v.optional(v.id('_storage')),
    cvFileName: v.optional(v.string()),
    cvSize: v.optional(v.number()),
    cvDeletedAt: v.optional(v.number()),
    // PROOF OF WHAT WAS ACCEPTED (GDPR art. 7.1): the charter, and the notice
    // about the CV and about the news received once joined — versioned.
    consent: v.object({
      at: v.number(),
      charterVersion: v.string(),
      noticeVersion: v.string(),
    }),
    // OPTIONAL consent to have the CV read with the help of an automatic tool
    // run by a third-party provider (docs/cercle-amis.md § 9). Asked only when
    // `CERCLE_CV_AI_ENABLED` is on; without it, only a human ever reads the CV.
    cvAiConsent: v.optional(
      v.object({ at: v.number(), noticeVersion: v.string() }),
    ),
    // THE SUMMARY, and nothing else the tool produced. A neutral description of
    // what the CV says, to help the president sort. NO score, rank, label,
    // risk or "deviation" field exists, here or in the tool's output schema: a
    // test fails if one is added. Deleted with the CV on refusal, and with the
    // request on account deletion.
    cvSummary: v.optional(
      v.object({
        overview: v.string(),
        education: v.array(v.string()),
        experience: v.array(v.string()),
        languages: v.array(v.string()),
        themes: v.array(v.string()),
        model: v.string(),
        at: v.number(),
      }),
    ),
    // The tool failed (provider down, unreadable file): a human reads the CV.
    cvSummaryFailedAt: v.optional(v.number()),
    status: cercleRequestStatus,
    submittedAt: v.number(),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    // Internal: written for the team, never sent to the applicant.
    reviewNotes: v.optional(v.string()),
    // The account the approval made an Ami (created or existing).
    memberUserId: v.optional(v.id('users')),
    invitedAt: v.optional(v.number()),
  })
    .index('by_status', ['status'])
    .index('by_email', ['email'])
    .index('by_applicant', ['applicantUserId'])
    .index('by_member', ['memberUserId']),

  // PRIVATE CONTRIBUTIONS of the Cercle — free text written by an Ami or a
  // member, read by the Cercle only (`requireCercleAccess`). A table of its
  // own, NOT `contentTranslations`, publications or KOHOP: nothing here is
  // indexed, searched, translated, listed in the sitemap or sent to the AI
  // moderation provider (docs/cercle-amis.md § 4).
  cercleContributions: defineTable({
    authorUserId: v.id('users'),
    body: v.string(),
    createdAt: v.number(),
    // Taken down by its author or by staff: kept as a tombstone with no text.
    status: v.union(v.literal('visible'), v.literal('removed')),
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.id('users')),
  })
    .index('by_status_and_createdAt', ['status', 'createdAt'])
    .index('by_author', ['authorUserId']),

  // MAILING LIST OF THE CERCLE — separate from the public newsletter.
  //
  // Two doors in. (1) `request`: the person asked to join the Cercle and was
  // accepted; they were told, before sending the request, that they would
  // receive the Cercle's news, so they are `confirmed` from the start, with the
  // versions of the notice they accepted as proof. (2) `import`: a contact the
  // association already had and who asked for NOTHING. They are `pending` and
  // receive ONE message — a confirmation request (lawful basis: the person's own
  // click), after which they are `confirmed`. Without a click they receive
  // nothing more and the row is deleted when its deadline passes.
  //
  // An unsubscribe does NOT delete the row: it becomes `unsubscribed`, a
  // suppression entry, so that re-importing the same file never writes to
  // someone who said no. Only a NEW explicit request to join lifts it.
  cercleContacts: defineTable({
    // Normalized address (lib/onboarding.ts `normalizeEmail`).
    email: v.string(),
    locale: v.optional(locale),
    status: v.union(
      v.literal('pending'),
      v.literal('confirmed'),
      v.literal('unsubscribed'),
    ),
    source: v.union(v.literal('request'), v.literal('import')),
    // 128-bit random token of the unsubscribe link, in every message.
    unsubToken: v.string(),
    // Confirmation of an imported contact: the token is stored HASHED only.
    confirmTokenHash: v.optional(v.string()),
    confirmExpiresAt: v.optional(v.number()),
    // Number of confirmation messages sent: BOUNDED, and a failure to send is
    // retried within that bound.
    confirmSends: v.number(),
    // Still to be asked: true from the import until a wave takes the contact,
    // true again if that wave FAILED to send and the bound is not reached. A
    // contact whose message went out and who did not answer is NOT to be asked
    // again — they are never in this state. Missing on contacts that were never
    // imported (requests are confirmed from the start).
    toAsk: v.optional(v.boolean()),
    confirmLastSentAt: v.optional(v.number()),
    confirmError: v.optional(v.string()),
    confirmedAt: v.optional(v.number()),
    unsubscribedAt: v.optional(v.number()),
    // Provenance of an imported contact: when, by whom, and the label of the
    // file (never its content).
    importedAt: v.optional(v.number()),
    importedBy: v.optional(v.id('users')),
    importBatch: v.optional(v.string()),
    // PROOF OF CONSENT (GDPR art. 7.1): `request` contacts carry the versions
    // of the notice accepted at the form; `import` contacts carry the click.
    consent: v.optional(
      v.object({
        at: v.number(),
        via: v.union(v.literal('request'), v.literal('confirmation_link')),
        textVersion: v.string(),
      }),
    ),
    createdAt: v.number(),
  })
    .index('by_email', ['email'])
    .index('by_token', ['unsubToken'])
    .index('by_confirm_hash', ['confirmTokenHash'])
    // The recipients of a campaign (`confirmed`), the purge of expired ones
    // (`pending` + deadline), and — through `by_status_and_toAsk` — the
    // contacts still to be asked.
    .index('by_status_and_expiry', ['status', 'confirmExpiresAt'])
    .index('by_status_and_toAsk', ['status', 'toAsk']),

  // WHEN THE LAST "A REQUEST IS WAITING" E-MAIL WENT (singleton row), so that a
  // burst of requests tells the team once, not once each. Holds no personal
  // data: two timestamps.
  cercleAlertState: defineTable({
    lastAlertAt: v.number(),
    // A follow-up is scheduled for the end of the window (covers the requests
    // that came in during it).
    followUpAt: v.optional(v.number()),
  }),
};

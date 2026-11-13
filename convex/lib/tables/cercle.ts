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
};

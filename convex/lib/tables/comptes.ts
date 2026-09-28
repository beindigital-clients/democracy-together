import { defineTable } from 'convex/server';
import { v } from 'convex/values';

// "Accounts" workstream (F-63 lifecycle, F-21 member profile, 2FA).
//
// Tables SPECIFIC to the workstream. Fields added to existing tables
// (`users.suspendedAt`, `organizations.logoFileId`, `publications.organizationId`…)
// live in place in convex/schema.ts.

// Public fields of a directory profile as proposed by a manager. Same
// vocabulary as the profile (`organizations`), plus `showMembers`: the
// organisation decides whether its public page names its members.
export const organizationRevisionFields = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  websiteUrl: v.optional(v.string()),
  country: v.string(),
  region: v.string(),
  themes: v.array(v.string()),
  languages: v.array(v.string()),
  showMembers: v.boolean(),
});

export const comptesTables = {
  // --- Two-factor authentication (TOTP, RFC 6238) --------------------------
  //
  // ONE row per account. The secret is NEVER stored in plaintext: it is
  // encrypted with AES-GCM using the TWO_FACTOR_ENCRYPTION_KEY environment key
  // (convex/lib/secretBox.ts). `keyId` says which key: `env` in production,
  // `dev` on a test deployment without a key (AUTH_DEV_OTP) — a secret
  // encrypted with the development key is REFUSED as soon as the deployment
  // carries a real key, so it cannot survive an inadvertent go-live.
  //
  // `lastUsedStep`: time step (RFC 6238 counter) of the last accepted code.
  // A code is only valid for a STRICTLY greater step — that is what prevents
  // replaying an intercepted code within its 30 s window.
  //
  // Backup codes are HASHES (SHA-256), ten at most: a list bounded by
  // construction, hence an array rather than a table.
  twoFactorCredentials: defineTable({
    userId: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('active')),
    secretCiphertext: v.string(),
    secretIv: v.string(),
    keyId: v.union(v.literal('env'), v.literal('dev')),
    lastUsedStep: v.optional(v.number()),
    backupCodes: v.array(
      v.object({ hash: v.string(), usedAt: v.optional(v.number()) }),
    ),
    createdAt: v.number(),
    activatedAt: v.optional(v.number()),
  }).index('by_user', ['userId']),

  // Second-factor proof, BOUND TO A Convex Auth SESSION (`getAuthSessionId`).
  // A new sign-in opens a new session, hence a session without proof: that is
  // what forces every sign-in to present the code, not just the first one.
  twoFactorSessionProofs: defineTable({
    sessionId: v.id('authSessions'),
    userId: v.id('users'),
    method: v.union(v.literal('totp'), v.literal('backup')),
    verifiedAt: v.number(),
  })
    .index('by_session', ['sessionId'])
    .index('by_user', ['userId']),

  // Security settings — SINGLETON (`key` is always 'default'), same pattern as
  // `aiModerationConfig`. Absent = default values
  // (convex/lib/accountAccess.ts): 2FA NOT mandatory, because the shared E2E
  // server creates administrator accounts that have no device.
  // docs/backlog/comptes.md: TO ENABLE AT GO-LIVE.
  securitySettings: defineTable({
    key: v.literal('default'),
    twoFactorRequiredForStaff: v.boolean(),
    updatedBy: v.optional(v.id('users')),
    updatedAt: v.number(),
  }).index('by_key', ['key']),

  // E-mail reconfirmation code for an irreversible action requested by the
  // account holder themselves (deleting their account). HASH only, short
  // expiry, attempts counted.
  accountConfirmationCodes: defineTable({
    userId: v.id('users'),
    purpose: v.literal('delete_account'),
    codeHash: v.string(),
    expiresAt: v.number(),
    attempts: v.number(),
    createdAt: v.number(),
  }).index('by_user_and_purpose', ['userId', 'purpose']),

  // Account deletions IN PROGRESS or finished (convex/lib/accountDeletion.ts).
  // Deletion is split into batches (a Convex mutation is bounded): this row
  // holds the resume point. It keeps NO personal data — neither address nor
  // name — only the identifier of the deleted account, which no longer
  // designates anyone once the `users` row is deleted.
  accountDeletions: defineTable({
    userId: v.id('users'),
    via: v.union(v.literal('admin'), v.literal('self')),
    requestedBy: v.optional(v.id('users')),
    status: v.union(v.literal('running'), v.literal('done')),
    // Current step in the ordered registry of modules.
    step: v.number(),
    // The account's address, kept ONLY FOR THE DURATION of processing: several
    // tables are linked by address (newsletter, reminders…). Erased at the last
    // step.
    email: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_status', ['status']),

  // Directory profile revisions proposed by an organisation's MANAGER (F-21).
  // Subject to a moderator's approval: the public profile speaks on behalf of
  // the network (see docs/backlog/comptes.md). The live profile keeps being
  // served as is during the review.
  organizationRevisions: defineTable({
    orgId: v.id('organizations'),
    submittedBy: v.id('users'),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
      v.literal('superseded'),
    ),
    fields: organizationRevisionFields,
    // Proposed logo: a Convex storage file whose CONTENT has been verified
    // (PNG / JPEG / WebP signature, size) by `orgAdmin.attachLogo`.
    logoFileId: v.optional(v.id('_storage')),
    removeLogo: v.optional(v.boolean()),
    submittedAt: v.number(),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    reviewNotes: v.optional(v.string()),
  })
    .index('by_org_and_status', ['orgId', 'status'])
    .index('by_status', ['status'])
    .index('by_submitter', ['submittedBy']),

  // Uploaded and VERIFIED logos, waiting to be attached to a revision.
  // A file only enters a revision by going through this table: the client
  // cannot designate an arbitrary storage identifier.
  organizationLogoUploads: defineTable({
    orgId: v.id('organizations'),
    uploadedBy: v.id('users'),
    fileId: v.id('_storage'),
    contentType: v.string(),
    createdAt: v.number(),
  })
    .index('by_file', ['fileId'])
    .index('by_uploader', ['uploadedBy']),
};

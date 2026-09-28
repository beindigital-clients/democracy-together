import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  aiModerationApplied,
  aiModerationSeverity,
  aiModerationVerdict,
} from '../aiModeration';
import {
  contentStatusValidator,
  invitationStatusValidator,
  moderationEventKindValidator,
  moderationModeValidator,
  moderationTargetValidator,
  workspaceRoleValidator,
} from '../communaute';

// Tables of the "community" workstream: collaborative spaces (files,
// invitations), pre-moderation of the Tribune and its history, deep-dive.
// The EXISTING tables it touches (workspaces, workspaceMembers,
// tribunePosts, tribuneComments…) are modified in place in convex/schema.ts.

export const communauteTables = {
  // LOGICAL FILE of a space (F-24): a name, and a sequence of versions. The row
  // carries a summary of the current version so that the file list does not
  // re-read every version.
  workspaceFiles: defineTable({
    workspaceId: v.id('workspaces'),
    name: v.string(),
    createdBy: v.id('users'),
    createdByName: v.string(),
    currentVersion: v.number(),
    versionCount: v.number(),
    // Sum of the sizes of ALL retained versions: this is what is deducted from
    // the space's quota on deletion.
    totalBytes: v.number(),
    latestSize: v.number(),
    latestContentType: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_creator', ['createdBy']),

  // Successive VERSIONS of a file, with their author and date. The blob
  // (`storageId`) NEVER leaves Convex as is: only a signed URL, produced for a
  // member of the space, grants access to it.
  workspaceFileVersions: defineTable({
    fileId: v.id('workspaceFiles'),
    workspaceId: v.id('workspaces'),
    version: v.number(),
    storageId: v.id('_storage'),
    size: v.number(),
    // Type of the format RECOGNISED by byte checking (convex/lib/fileCheck.ts),
    // not the one announced by the browser.
    contentType: v.string(),
    sha256: v.string(),
    authorUserId: v.id('users'),
    authorName: v.string(),
    createdAt: v.number(),
  })
    .index('by_file_and_version', ['fileId', 'version'])
    .index('by_workspace', ['workspaceId'])
    .index('by_author', ['authorUserId'])
    // Un même blob ne sert qu'une version : sans cette garde, l'identifiant
    // d'un fichier d'un autre espace (lu dans une URL) pourrait être
    // « rattaché » à un espace où l'on est animateur, et servi à ses membres.
    .index('by_storage', ['storageId']),

  // INVITATIONS to a space. The invitee is designated by their ADDRESS: the
  // matching account, if it exists, is attached on creation
  // (`invitedUserId`), but the answer to the facilitator is the same in both
  // cases — inviting is not a way to find out who is registered.
  workspaceInvitations: defineTable({
    workspaceId: v.id('workspaces'),
    email: v.string(),
    invitedUserId: v.optional(v.id('users')),
    role: workspaceRoleValidator,
    invitedBy: v.id('users'),
    invitedByName: v.string(),
    status: invitationStatusValidator,
    expiresAt: v.number(),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index('by_workspace_and_status', ['workspaceId', 'status'])
    .index('by_email_and_status', ['email', 'status'])
    .index('by_user_and_status', ['invitedUserId', 'status'])
    .index('by_inviter', ['invitedBy']),

  // Tribune moderation SETTINGS — SINGLETON (`key` = 'default').
  // Absent: posts pre-moderated, comments post-moderated (see
  // DEFAULT_COMMUNITY_MODERATION).
  communityModerationConfig: defineTable({
    key: v.literal('default'),
    postMode: moderationModeValidator,
    commentMode: moderationModeValidator,
    updatedBy: v.id('users'),
    updatedAt: v.number(),
  }).index('by_key', ['key']),

  // MODERATION HISTORY (F-49) — one row per event, never rewritten:
  // submission, edit, AI opinion, decision, report. `targetId` is a string
  // (post OR comment, `targetType` says which); `postId` links a comment to its
  // post.
  moderationEvents: defineTable({
    targetType: moderationTargetValidator,
    targetId: v.string(),
    postId: v.optional(v.id('tribunePosts')),
    kind: moderationEventKindValidator,
    // Absent for an event with no human author (AI opinion, deleted account).
    actorId: v.optional(v.id('users')),
    statusFrom: v.optional(contentStatusValidator),
    statusTo: v.optional(contentStatusValidator),
    reason: v.optional(v.string()),
    // AI opinion, copied in full: the history must be readable without looking
    // elsewhere for what the model said.
    ai: v.optional(
      v.object({
        verdict: aiModerationVerdict,
        applied: aiModerationApplied,
        reason: v.string(),
        confidence: v.number(),
        summary: v.string(),
        findings: v.array(
          v.object({
            ruleKey: v.string(),
            ruleLabel: v.string(),
            severity: aiModerationSeverity,
            outcome: v.union(
              v.literal('pass'),
              v.literal('fail'),
              v.literal('unsure'),
            ),
            explanation: v.string(),
            quote: v.optional(v.string()),
          }),
        ),
        model: v.string(),
        configVersion: v.number(),
        error: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
  })
    .index('by_target', ['targetType', 'targetId'])
    .index('by_actor', ['actorId']),

  // DEEP-DIVE (F-48): the author of a short post invites a member to extend it
  // into an in-depth contribution. Same principle as space invitations:
  // designated by address, with no existence oracle.
  tribuneDeepeningInvites: defineTable({
    postId: v.id('tribunePosts'),
    email: v.string(),
    invitedUserId: v.optional(v.id('users')),
    invitedBy: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('revoked')),
    createdAt: v.number(),
  })
    .index('by_post', ['postId'])
    .index('by_email', ['email'])
    .index('by_user', ['invitedUserId'])
    .index('by_inviter', ['invitedBy']),
};

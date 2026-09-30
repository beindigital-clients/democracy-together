import { v } from 'convex/values';
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from '../_generated/server';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import {
  linkKindValidator,
  messagePolicyValidator,
  profileVisibilityValidator,
} from '../lib/social';
import {
  isMemberRole,
  photoUrl,
  profileByUserId,
  viewerCanSee,
} from '../lib/socialAccess';
import { removeFollow } from './follows';

// SOCIAL DATA LIFECYCLE: account deletion and GDPR export.
//
// The "accounts" workstream calls `deleteUserDataSocial(ctx, userId)` from
// its own account deletion (INTERNAL function, without `ctx.auth`), and
// `exportUserDataSocial(ctx, userId)` from its export.
//
// DECISION — DELETION, NOT ANONYMIZATION, for everything social:
//
//  - Profile, photo, follow links, blocks: the person's own data, with no
//    value to others once the person is gone. Deleted. The follower counts
//    of OTHER profiles are decremented in the same operation.
//
//  - Private messages: DELETED, in both directions, along with the conversation.
//    Anonymization was ruled out for three reasons:
//      1. a private message is free text; replacing the sender's name
//         with "compte supprimé" does not anonymize a body that
//         says "it's Awa, from institute X" — that would be pseudonymization
//         presented as anonymization;
//      2. unlike a Tribune post, a 1:1 conversation has
//         no collective value to preserve: it has only one reader;
//      3. the remaining half (the other party's messages) is
//         unintelligible without the other, and would remain linked to a person who
//         requested erasure.
//    The cost, accepted and documented (docs/backlog/social.md): the other party
//    loses the conversation. They can export it beforehand, like any data.
//
//  - Reports where the person is reported OR reporting: deleted
//    (the forwarded message disappears with the account; any decision
//    remains in the audit log, which holds only identifiers).
//
// Deletion is DONE IN BATCHES: a Convex transaction is bounded in writes,
// and an old account can hold thousands of messages. The function returns
// `{ done }`; `deleteUserDataSocialStep` re-runs it until the end.

const DELETE_BUDGET = 400;

export async function deleteUserDataSocial(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<{ done: boolean }> {
  let budget = DELETE_BUDGET;

  // 1. Conversations (both participants, all messages).
  const CONV_BATCH = 20;
  const convIds = new Set<Id<'conversations'>>();
  const own = await ctx.db
    .query('conversationMembers')
    .withIndex('by_user_and_lastMessageAt', (q) => q.eq('userId', userId))
    .take(CONV_BATCH);
  const theirs = await ctx.db
    .query('conversationMembers')
    .withIndex('by_otherUserId', (q) => q.eq('otherUserId', userId))
    .take(CONV_BATCH);
  for (const m of [...own, ...theirs]) convIds.add(m.conversationId);
  for (const conversationId of convIds) {
    const msgs = await ctx.db
      .query('directMessages')
      .withIndex('by_conversation', (q) =>
        q.eq('conversationId', conversationId),
      )
      .take(budget);
    for (const msg of msgs) await ctx.db.delete(msg._id);
    budget -= msgs.length;
    if (budget <= 0) return { done: false };
    const members = await ctx.db
      .query('conversationMembers')
      .withIndex('by_conversation', (q) =>
        q.eq('conversationId', conversationId),
      )
      .take(10);
    for (const row of members) await ctx.db.delete(row._id);
    const typing = await ctx.db
      .query('conversationTyping')
      .withIndex('by_conversation_and_userId', (q) =>
        q.eq('conversationId', conversationId),
      )
      .take(10);
    for (const row of typing) await ctx.db.delete(row._id);
    if (await ctx.db.get(conversationId)) await ctx.db.delete(conversationId);
    budget -= members.length + typing.length + 1;
    if (budget <= 0) return { done: false };
  }
  // A full batch: some may remain, we resume on the next pass.
  if (own.length === CONV_BATCH || theirs.length === CONV_BATCH) {
    return { done: false };
  }

  // Messages sent outside a still-attached conversation (inconsistent
  // data, for example a conversation deleted by hand).
  const stray = await ctx.db
    .query('directMessages')
    .withIndex('by_sender', (q) => q.eq('senderId', userId))
    .take(budget);
  for (const msg of stray) await ctx.db.delete(msg._id);
  budget -= stray.length;
  if (budget <= 0) return { done: false };

  // 2. Reports (reporter or reported).
  for (const idx of ['by_reporter', 'by_reportedUser'] as const) {
    const rows =
      idx === 'by_reporter'
        ? await ctx.db
            .query('messageReports')
            .withIndex('by_reporter', (q) => q.eq('reporterId', userId))
            .take(budget)
        : await ctx.db
            .query('messageReports')
            .withIndex('by_reportedUser', (q) => q.eq('reportedUserId', userId))
            .take(budget);
    for (const r of rows) await ctx.db.delete(r._id);
    budget -= rows.length;
    if (budget <= 0) return { done: false };
  }

  // 3. Follows, in both directions (others' counters maintained by removeFollow).
  const following = await ctx.db
    .query('follows')
    .withIndex('by_follower_and_followee', (q) => q.eq('followerId', userId))
    .take(Math.max(1, Math.floor(budget / 4)));
  for (const f of following) await removeFollow(ctx, userId, f.followeeId);
  budget -= following.length * 4;
  if (budget <= 0) return { done: false };
  const followers = await ctx.db
    .query('follows')
    .withIndex('by_followee', (q) => q.eq('followeeId', userId))
    .take(Math.max(1, Math.floor(budget / 4)));
  for (const f of followers) await removeFollow(ctx, f.followerId, userId);
  budget -= followers.length * 4;
  if (budget <= 0) return { done: false };

  // 4. Followed organizations, blocks in both directions.
  const orgs = await ctx.db
    .query('orgFollows')
    .withIndex('by_user_and_org', (q) => q.eq('userId', userId))
    .take(budget);
  for (const r of orgs) await ctx.db.delete(r._id);
  budget -= orgs.length;
  const blocking = await ctx.db
    .query('blocks')
    .withIndex('by_blocker_and_blocked', (q) => q.eq('blockerId', userId))
    .take(Math.max(1, budget));
  for (const r of blocking) await ctx.db.delete(r._id);
  budget -= blocking.length;
  const blockedBy = await ctx.db
    .query('blocks')
    .withIndex('by_blocked', (q) => q.eq('blockedId', userId))
    .take(Math.max(1, budget));
  for (const r of blockedBy) await ctx.db.delete(r._id);
  budget -= blockedBy.length;
  if (budget <= 0) return { done: false };

  // 5. The profile LAST (the previous steps re-read the counters),
  //    and its photo in storage.
  const profile = await profileByUserId(ctx, userId);
  if (profile) {
    if (profile.photoId) await ctx.storage.delete(profile.photoId);
    await ctx.db.delete(profile._id);
  }
  return { done: true };
}

// Schedulable wrapper: re-runs the next batch as long as some remain. The
// "accounts" workstream can call the function directly in its
// transaction, or schedule this one for large accounts.
export const deleteUserDataSocialStep = internalMutation({
  args: { userId: v.id('users') },
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx, { userId }) => {
    const result = await deleteUserDataSocial(ctx, userId);
    if (!result.done) {
      await ctx.scheduler.runAfter(
        0,
        internal.social.account.deleteUserDataSocialStep,
        { userId },
      );
    }
    return result;
  },
});

// --- GDPR export -------------------------------------------------------------------

export const socialExportValidator = v.object({
  profile: v.union(
    v.object({
      handle: v.string(),
      displayName: v.string(),
      photoUrl: v.union(v.string(), v.null()),
      bio: v.union(v.string(), v.null()),
      jobTitle: v.union(v.string(), v.null()),
      country: v.union(v.string(), v.null()),
      themes: v.array(v.string()),
      languages: v.array(v.string()),
      links: v.array(v.object({ kind: linkKindValidator, url: v.string() })),
      visibility: profileVisibilityValidator,
      messagePolicy: messagePolicyValidator,
      mutedNotificationTypes: v.array(v.string()),
      messageEmail: v.boolean(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  following: v.array(
    v.object({
      displayName: v.string(),
      handle: v.union(v.string(), v.null()),
      since: v.number(),
    }),
  ),
  // Followers are THIRD PARTIES: we export those whose profile is visible
  // to the person, and the count of the others — never their identity.
  followers: v.array(
    v.object({
      displayName: v.string(),
      handle: v.string(),
      since: v.number(),
    }),
  ),
  hiddenFollowers: v.number(),
  organizationsFollowed: v.array(
    v.object({ name: v.string(), slug: v.string(), since: v.number() }),
  ),
  blocked: v.array(v.object({ displayName: v.string(), since: v.number() })),
  // THEIR copy of the conversations: messages sent AND received (a
  // correspondence addressed to the person concerns them), excluding messages they
  // deleted from their copy.
  conversations: v.array(
    v.object({
      with: v.string(),
      messages: v.array(
        v.object({ fromMe: v.boolean(), body: v.string(), at: v.number() }),
      ),
    }),
  ),
  reportsMade: v.array(
    v.object({
      at: v.number(),
      reason: v.union(v.string(), v.null()),
      resolved: v.boolean(),
    }),
  ),
});

const EXPORT_LIST_MAX = 1000;
const EXPORT_MESSAGES_MAX = 5000;

export async function exportUserDataSocial(ctx: QueryCtx, userId: Id<'users'>) {
  const p = await profileByUserId(ctx, userId);
  const user = await ctx.db.get(userId);
  const viewer = user
    ? { userId, user, isMember: isMemberRole(user.role) }
    : null;
  const nameOf = async (id: Id<'users'>) => {
    const other = await profileByUserId(ctx, id);
    if (other) return other.displayName;
    return (await ctx.db.get(id))?.name?.trim() ?? '';
  };

  const following = [];
  for (const f of await ctx.db
    .query('follows')
    .withIndex('by_follower_and_followee', (q) => q.eq('followerId', userId))
    .take(EXPORT_LIST_MAX)) {
    const other = await profileByUserId(ctx, f.followeeId);
    following.push({
      displayName: other?.displayName ?? (await nameOf(f.followeeId)),
      handle:
        other && viewer && (await viewerCanSee(ctx, viewer, other))
          ? other.handle
          : null,
      since: f.createdAt,
    });
  }

  const followers = [];
  let hiddenFollowers = 0;
  for (const f of await ctx.db
    .query('follows')
    .withIndex('by_followee', (q) => q.eq('followeeId', userId))
    .take(EXPORT_LIST_MAX)) {
    const other = await profileByUserId(ctx, f.followerId);
    if (other && viewer && (await viewerCanSee(ctx, viewer, other))) {
      followers.push({
        displayName: other.displayName,
        handle: other.handle,
        since: f.createdAt,
      });
    } else {
      hiddenFollowers++;
    }
  }

  const organizationsFollowed = [];
  for (const r of await ctx.db
    .query('orgFollows')
    .withIndex('by_user_and_org', (q) => q.eq('userId', userId))
    .take(EXPORT_LIST_MAX)) {
    const org = await ctx.db.get(r.orgId);
    if (org) {
      organizationsFollowed.push({
        name: org.name,
        slug: org.slug,
        since: r.createdAt,
      });
    }
  }

  const blocked = [];
  for (const r of await ctx.db
    .query('blocks')
    .withIndex('by_blocker_and_blocked', (q) => q.eq('blockerId', userId))
    .take(EXPORT_LIST_MAX)) {
    blocked.push({
      displayName: await nameOf(r.blockedId),
      since: r.createdAt,
    });
  }

  const conversations = [];
  let budget = EXPORT_MESSAGES_MAX;
  for (const mine of await ctx.db
    .query('conversationMembers')
    .withIndex('by_user_and_lastMessageAt', (q) => q.eq('userId', userId))
    .order('desc')
    .take(EXPORT_LIST_MAX)) {
    if (budget <= 0) break;
    const msgs = await ctx.db
      .query('directMessages')
      .withIndex('by_conversation', (q) =>
        q.eq('conversationId', mine.conversationId),
      )
      .take(budget);
    budget -= msgs.length;
    const kept = msgs
      .filter(
        (m) =>
          !m.hiddenFor.includes(userId) &&
          !m.removed &&
          (mine.clearedAt === undefined || m.createdAt > mine.clearedAt),
      )
      .map((m) => ({
        fromMe: m.senderId === userId,
        body: m.body,
        at: m.createdAt,
      }));
    if (kept.length > 0) {
      conversations.push({
        with: await nameOf(mine.otherUserId),
        messages: kept,
      });
    }
  }

  const reportsMade = (
    await ctx.db
      .query('messageReports')
      .withIndex('by_reporter', (q) => q.eq('reporterId', userId))
      .take(EXPORT_LIST_MAX)
  ).map((r) => ({
    at: r.createdAt,
    reason: r.reason ?? null,
    resolved: r.resolved,
  }));

  return {
    profile: p
      ? {
          handle: p.handle,
          displayName: p.displayName,
          photoUrl: await photoUrl(ctx, p),
          bio: p.bio ?? null,
          jobTitle: p.jobTitle ?? null,
          country: p.country ?? null,
          themes: p.themes,
          languages: p.languages,
          links: p.links,
          visibility: p.visibility,
          messagePolicy: p.messagePolicy,
          mutedNotificationTypes: p.mutedNotificationTypes,
          messageEmail: p.messageEmail,
          updatedAt: p.updatedAt,
        }
      : null,
    following,
    followers,
    hiddenFollowers,
    organizationsFollowed,
    blocked,
    conversations,
    reportsMade,
  };
}

// Internal wrapper for the "accounts" workstream export (without `ctx.auth`).
export const exportUserDataSocialQuery = internalQuery({
  args: { userId: v.id('users') },
  returns: socialExportValidator,
  handler: async (ctx, { userId }) => await exportUserDataSocial(ctx, userId),
});

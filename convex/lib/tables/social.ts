import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  linkKindValidator,
  messagePolicyValidator,
  profileVisibilityValidator,
} from '../social';

// Tables of the "social" workstream (people profiles, following, private
// messaging). None extends `users`: the account lifecycle belongs to another
// workstream, and everything specific to the social network lives here, next
// to its deletion function (`convex/social/account.ts`).
export const socialTables = {
  // Person profile — ONE per account (`by_userId`), created on first save. The
  // handle is the public identifier (`/membres/<handle>`).
  memberProfiles: defineTable({
    userId: v.id('users'),
    handle: v.string(),
    displayName: v.string(),
    photoId: v.optional(v.id('_storage')),
    bio: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    // Country (ISO 3166-1 alpha-2, uppercase): directory filter.
    country: v.optional(v.string()),
    themes: v.array(v.string()),
    languages: v.array(v.string()),
    links: v.array(v.object({ kind: linkKindValidator, url: v.string() })),
    visibility: profileVisibilityValidator,
    messagePolicy: messagePolicyValidator,
    // Notification types turned off (NOTIFICATION_PREF_TYPES vocabulary).
    mutedNotificationTypes: v.array(v.string()),
    // "New message from X" e-mail (without the content). Opt-in.
    messageEmail: v.boolean(),
    // Denormalisations maintained ON WRITE: `listed` = visible in the directory
    // (visibility ≠ private) — used as a filter IN the search index, so that a
    // private profile is not even read; `searchText` and `nameKey` serve search
    // and sorting.
    listed: v.boolean(),
    searchText: v.string(),
    nameKey: v.string(),
    followerCount: v.number(),
    followingCount: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_handle', ['handle'])
    // A photo belongs to ONE profile only: without this check, attaching someone
    // else's storage identifier would delete THEIR photo the day one changed
    // one's own.
    .index('by_photoId', ['photoId'])
    .index('by_listed_and_nameKey', ['listed', 'nameKey'])
    .searchIndex('search_text', {
      searchField: 'searchText',
      filterFields: ['listed', 'country'],
    }),

  // Person-to-person following (one-way).
  follows: defineTable({
    followerId: v.id('users'),
    followeeId: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_follower_and_followee', ['followerId', 'followeeId'])
    .index('by_followee', ['followeeId']),

  // Following a directory organisation.
  orgFollows: defineTable({
    userId: v.id('users'),
    orgId: v.id('organizations'),
    createdAt: v.number(),
  })
    .index('by_user_and_org', ['userId', 'orgId'])
    .index('by_org', ['orgId']),

  // Blocking: `blockerId` blocked `blockedId`. The effect is symmetric for
  // messaging and following (see `isBlockedEitherWay`).
  blocks: defineTable({
    blockerId: v.id('users'),
    blockedId: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_blocker_and_blocked', ['blockerId', 'blockedId'])
    .index('by_blocked', ['blockedId']),

  // 1:1 conversation. The pair is ORDERED (`userA` < `userB` as strings) so
  // that only one conversation exists per pair, whoever the initiator.
  conversations: defineTable({
    userA: v.id('users'),
    userB: v.id('users'),
    createdAt: v.number(),
    lastMessageAt: v.number(),
  }).index('by_pair', ['userA', 'userB']),

  // State of a conversation FOR ONE participant (two rows per conversation):
  // unread, last read, deleted copy. Separate from `conversations` so that one
  // participant reading does not cause a write conflict with the other's
  // sending.
  conversationMembers: defineTable({
    conversationId: v.id('conversations'),
    userId: v.id('users'),
    otherUserId: v.id('users'),
    lastMessageAt: v.number(),
    unreadCount: v.number(),
    hasUnread: v.boolean(),
    lastReadAt: v.number(),
    // "Delete my copy" of the conversation: messages prior to this instant are
    // no longer served to this participant.
    clearedAt: v.optional(v.number()),
    // Removed from the list until the next message.
    hidden: v.boolean(),
    // Has this participant already written? ("who can write to me" rule).
    hasWritten: v.boolean(),
  })
    .index('by_user_and_lastMessageAt', ['userId', 'lastMessageAt'])
    .index('by_user_and_hasUnread', ['userId', 'hasUnread'])
    .index('by_conversation', ['conversationId'])
    .index('by_otherUserId', ['otherUserId']),

  // Private messages. `hiddenFor`: participants who deleted THEIR copy of this
  // message; when both have, the row is erased.
  directMessages: defineTable({
    conversationId: v.id('conversations'),
    senderId: v.id('users'),
    body: v.string(),
    createdAt: v.number(),
    hiddenFor: v.array(v.id('users')),
    // Removed by moderation following a report: the body is emptied, the row
    // stays so the thread keeps its chronology.
    removed: v.optional(v.boolean()),
    // Quoted message (reply). Shown only while it is still in the reader's
    // copy.
    replyToId: v.optional(v.id('directMessages')),
    // Last correction by the sender (MESSAGE_EDIT_WINDOW_MS).
    editedAt: v.optional(v.number()),
    // At most one reaction per participant, so at most two entries: a
    // bounded array, not a list that grows.
    reactions: v.optional(
      v.array(v.object({ userId: v.id('users'), emoji: v.string() })),
    ),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_sender', ['senderId']),

  // "Is typing…" signal, one row per participant who typed in a
  // conversation. High-churn data kept apart from `conversationMembers`, so
  // that a keystroke does not rerun the conversation list. `until` is an
  // instant: the reader compares it with its own clock, a query never reads
  // the time.
  conversationTyping: defineTable({
    conversationId: v.id('conversations'),
    userId: v.id('users'),
    until: v.number(),
  }).index('by_conversation_and_userId', ['conversationId', 'userId']),

  // Private message reports — back-office queue
  // (/admin/signalements-messages). Same model as `tribuneReports`, with a
  // fundamental difference: a private message is only readable by its two
  // participants, so the moderator can only read it because the person
  // reporting it FORWARDS it to them. `bodySnapshot` is that forwarded copy;
  // it is erased on resolution (data minimisation).
  messageReports: defineTable({
    messageId: v.id('directMessages'),
    conversationId: v.id('conversations'),
    reporterId: v.id('users'),
    reportedUserId: v.id('users'),
    reason: v.optional(v.string()),
    bodySnapshot: v.optional(v.string()),
    resolved: v.boolean(),
    resolution: v.optional(
      v.union(v.literal('dismissed'), v.literal('removed')),
    ),
    createdAt: v.number(),
  })
    .index('by_resolved', ['resolved'])
    .index('by_message_and_reporter', ['messageId', 'reporterId'])
    .index('by_reporter', ['reporterId'])
    .index('by_reportedUser', ['reportedUserId']),
};

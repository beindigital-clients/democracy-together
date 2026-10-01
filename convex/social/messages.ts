import { v, ConvexError } from 'convex/values';
import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from '../_generated/server';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import { requireNetworkRole } from '../lib/rbac';
import { consumeRateLimit, enforceRateLimit } from '../lib/rateLimit';
import { notify } from '../lib/notify';
import { recordAudit } from '../lib/audit';
import { AUDIT } from '../lib/auditActions';
import { emailProviderStatus, sendEmail } from '../email';
import { newMessageEmail } from '../lib/socialEmail';
import { locale, type SiteLocale } from '../lib/locales';
import {
  MESSAGE_BOUNDS,
  REPORT_REASON_MAX,
  SOCIAL_NOTIF,
  SOCIAL_RATE_LIMITS,
  TYPING_TTL_MS,
  canEditMessage,
  isMessageReaction,
  messageRefusal,
  type MessageRefusal,
} from '../lib/social';
import {
  isBlocked,
  isBlockedEitherWay,
  isFollowing,
  loadViewer,
  photoUrl,
  profileByUserId,
  requireSocialMember,
  sortPair,
  userIsMember,
  viewerCanSee,
  type Viewer,
} from '../lib/socialAccess';
import { removeFollow } from './follows';

// PRIVATE 1:1 MESSAGING, real time (Convex queries are reactive: the
// list, the thread and the header badge update without reloading).
//
// Three rules hold the whole module together:
//  1. only the TWO participants read a conversation. A third party — even an
//     administrator — receives `null`, exactly as for a nonexistent
//     identifier. Moderation only sees a REPORTED message, forwarded by
//     the person who reports it;
//  2. no message content leaves this module other than to its
//     participants: no audit log, no notification, no email ("nouveau
//     message de X", nothing more), no `console.log`;
//  3. the "who can write to me" setting and blocking are checked ON EVERY
//     send, not only when the conversation is opened.

// --- Facts and decision ---------------------------------------------------------

async function membersOf(ctx: QueryCtx, conversationId: Id<'conversations'>) {
  return await ctx.db
    .query('conversationMembers')
    .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
    .take(2);
}

async function myMembership(
  ctx: QueryCtx,
  conversationId: Id<'conversations'>,
  userId: Id<'users'>,
) {
  const rows = await membersOf(ctx, conversationId);
  const mine = rows.find((r) => r.userId === userId) ?? null;
  const other = rows.find((r) => r.userId !== userId) ?? null;
  return { mine, other };
}

async function writeRefusal(
  ctx: QueryCtx,
  sender: NonNullable<Viewer>,
  recipientId: Id<'users'>,
  recipientMember: Doc<'conversationMembers'> | null,
): Promise<MessageRefusal | null> {
  const recipientProfile = await profileByUserId(ctx, recipientId);
  return messageRefusal({
    isSelf: sender.userId === recipientId,
    senderIsMember: sender.isMember,
    recipientIsMember: await userIsMember(ctx, recipientId),
    blockedEitherWay: await isBlockedEitherWay(ctx, sender.userId, recipientId),
    // Without a profile (deleted), no one can write to this account anymore.
    recipientPolicy: recipientProfile?.messagePolicy ?? 'nobody',
    recipientFollowsSender: await isFollowing(ctx, recipientId, sender.userId),
    recipientHasWritten: recipientMember?.hasWritten ?? false,
  });
}

function cleanBody(body: string): string {
  const text = body.trim();
  if (text.length < MESSAGE_BOUNDS.min) throw new ConvexError('EMPTY_MESSAGE');
  if (text.length > MESSAGE_BOUNDS.max) {
    throw new ConvexError('MESSAGE_TOO_LONG');
  }
  return text;
}

async function insertMessage(
  ctx: MutationCtx,
  args: {
    conversationId: Id<'conversations'>;
    mine: Doc<'conversationMembers'>;
    other: Doc<'conversationMembers'>;
    senderName: string;
    body: string;
    replyToId?: Id<'directMessages'>;
  },
) {
  const now = Date.now();
  const { conversationId, mine, other } = args;
  // One can only quote a message of THIS conversation that one still has.
  if (args.replyToId !== undefined) {
    const quoted = await ctx.db.get(args.replyToId);
    if (
      !quoted ||
      quoted.conversationId !== conversationId ||
      !inMyCopy(quoted, mine)
    ) {
      throw new ConvexError('NOT_FOUND');
    }
  }
  const messageId = await ctx.db.insert('directMessages', {
    conversationId,
    senderId: mine.userId,
    body: args.body,
    createdAt: now,
    hiddenFor: [],
    replyToId: args.replyToId,
  });
  // Sending ends "is typing…" at once rather than when the signal expires.
  await clearTyping(ctx, conversationId, mine.userId);
  await ctx.db.patch(conversationId, { lastMessageAt: now });
  await ctx.db.patch(mine._id, {
    lastMessageAt: now,
    lastReadAt: now,
    hasWritten: true,
    hidden: false,
  });
  await ctx.db.patch(other._id, {
    lastMessageAt: now,
    unreadCount: other.unreadCount + 1,
    hasUnread: true,
    hidden: false,
  });

  // In-app notification only on the TRANSITION to "unread": a burst of
  // ten messages rings only once. The title carries only the name.
  if (!other.hasUnread) {
    await notify(ctx, {
      userId: other.userId,
      type: SOCIAL_NOTIF.MESSAGE,
      titleKey: 'socialMessage',
      params: { name: args.senderName },
      link: `/espace-membre/messages?c=${conversationId}`,
    });
  }

  // "nouveau message de X" email: opt-in, at most one per conversation
  // per half hour, and only if a provider exists — otherwise sending
  // would fail in production (fail-closed `sendEmail`).
  const otherProfile = await profileByUserId(ctx, other.userId);
  if (
    otherProfile?.messageEmail &&
    emailProviderStatus().mode !== 'none' &&
    (await consumeRateLimit(ctx, {
      key: `social:msgEmail:${other.userId}:${conversationId}`,
      ...SOCIAL_RATE_LIMITS.messageEmail,
    }))
  ) {
    await ctx.scheduler.runAfter(
      0,
      internal.social.messages.sendNewMessageEmail,
      {
        recipientId: other.userId,
        senderName: args.senderName,
      },
    );
  }
  return messageId;
}

// --- Sending -------------------------------------------------------------------

// First message to a person (from their profile). Reuses the
// existing conversation if there is one: only one conversation per pair.
export const startConversation = mutation({
  args: { userId: v.id('users'), body: v.string() },
  returns: v.id('conversations'),
  handler: async (ctx, { userId, body }) => {
    const viewer = await requireSocialMember(ctx);
    const me = await profileByUserId(ctx, viewer.userId);
    if (!me) throw new ConvexError('PROFILE_REQUIRED');
    const text = cleanBody(body);
    const target = await profileByUserId(ctx, userId);
    // An invisible profile is a nonexistent profile: same refusal, so that
    // `startConversation` does not become an oracle for private profiles.
    if (!target || !(await viewerCanSee(ctx, viewer, target))) {
      throw new ConvexError('NOT_FOUND');
    }

    const [a, b] = sortPair(viewer.userId, userId);
    const existing = await ctx.db
      .query('conversations')
      .withIndex('by_pair', (q) => q.eq('userA', a).eq('userB', b))
      .unique();

    let conversationId: Id<'conversations'>;
    let mine: Doc<'conversationMembers'> | null = null;
    let other: Doc<'conversationMembers'> | null = null;
    if (existing) {
      conversationId = existing._id;
      ({ mine, other } = await myMembership(ctx, existing._id, viewer.userId));
    }
    const refusal = await writeRefusal(ctx, viewer, userId, other);
    if (refusal) throw new ConvexError(refusal);

    await enforceRateLimit(ctx, {
      key: `social:msg:${viewer.userId}`,
      ...SOCIAL_RATE_LIMITS.message,
    });

    if (!existing || !mine || !other) {
      await enforceRateLimit(ctx, {
        key: `social:newConv:${viewer.userId}`,
        ...SOCIAL_RATE_LIMITS.newConversation,
      });
      const now = Date.now();
      conversationId =
        existing?._id ??
        (await ctx.db.insert('conversations', {
          userA: a,
          userB: b,
          createdAt: now,
          lastMessageAt: now,
        }));
      const base = {
        conversationId,
        lastMessageAt: now,
        unreadCount: 0,
        hasUnread: false,
        lastReadAt: now,
        hidden: false,
        hasWritten: false,
      };
      mine =
        mine ??
        (await ctx.db.get(
          await ctx.db.insert('conversationMembers', {
            ...base,
            userId: viewer.userId,
            otherUserId: userId,
          }),
        ));
      other =
        other ??
        (await ctx.db.get(
          await ctx.db.insert('conversationMembers', {
            ...base,
            // The recipient has read nothing yet: `lastReadAt` drives the
            // sender's "Seen", so it must not start at the first message.
            lastReadAt: 0,
            userId,
            otherUserId: viewer.userId,
          }),
        ));
      if (!mine || !other) throw new Error('CONVERSATION_SETUP_FAILED');
    }

    await insertMessage(ctx, {
      conversationId: conversationId!,
      mine,
      other,
      senderName: me.displayName,
      body: text,
    });
    return conversationId!;
  },
});

export const sendMessage = mutation({
  args: {
    conversationId: v.id('conversations'),
    body: v.string(),
    replyToId: v.optional(v.id('directMessages')),
  },
  returns: v.id('directMessages'),
  handler: async (ctx, { conversationId, body, replyToId }) => {
    const viewer = await requireSocialMember(ctx);
    const text = cleanBody(body);
    const { mine, other } = await myMembership(
      ctx,
      conversationId,
      viewer.userId,
    );
    if (!mine || !other) throw new ConvexError('NOT_FOUND');
    const me = await profileByUserId(ctx, viewer.userId);
    if (!me) throw new ConvexError('PROFILE_REQUIRED');
    const refusal = await writeRefusal(ctx, viewer, other.userId, other);
    if (refusal) throw new ConvexError(refusal);
    await enforceRateLimit(ctx, {
      key: `social:msg:${viewer.userId}`,
      ...SOCIAL_RATE_LIMITS.message,
    });
    return await insertMessage(ctx, {
      conversationId,
      mine,
      other,
      senderName: me.displayName,
      body: text,
      replyToId,
    });
  },
});

// Correction of one's own message, within MESSAGE_EDIT_WINDOW_MS. The same
// checks as a send: a blocked conversation cannot be edited any more.
export const editMessage = mutation({
  args: { messageId: v.id('directMessages'), body: v.string() },
  returns: v.null(),
  handler: async (ctx, { messageId, body }) => {
    const viewer = await requireSocialMember(ctx);
    const text = cleanBody(body);
    const m = await ctx.db.get(messageId);
    if (!m) throw new ConvexError('NOT_FOUND');
    const { mine, other } = await myMembership(
      ctx,
      m.conversationId,
      viewer.userId,
    );
    if (!mine || !other || !inMyCopy(m, mine)) {
      throw new ConvexError('NOT_FOUND');
    }
    if (
      !canEditMessage({
        fromMe: m.senderId === viewer.userId,
        removed: m.removed === true,
        createdAt: m.createdAt,
        now: Date.now(),
      })
    ) {
      throw new ConvexError('NOT_EDITABLE');
    }
    const refusal = await writeRefusal(ctx, viewer, other.userId, other);
    if (refusal) throw new ConvexError(refusal);
    if (text === m.body) return null;
    await enforceRateLimit(ctx, {
      key: `social:msgEdit:${viewer.userId}`,
      ...SOCIAL_RATE_LIMITS.messageEdit,
    });
    await ctx.db.patch(messageId, { body: text, editedAt: Date.now() });
    return null;
  },
});

// Reaction to a message: `emoji` replaces the viewer's previous one, `null`
// withdraws it. No notification: a reaction is a nod, not a message.
export const reactToMessage = mutation({
  args: {
    messageId: v.id('directMessages'),
    emoji: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { messageId, emoji }) => {
    const viewer = await requireSocialMember(ctx);
    if (emoji !== null && !isMessageReaction(emoji)) {
      throw new ConvexError('INVALID_REACTION');
    }
    const m = await ctx.db.get(messageId);
    if (!m) throw new ConvexError('NOT_FOUND');
    const { mine, other } = await myMembership(
      ctx,
      m.conversationId,
      viewer.userId,
    );
    if (!mine || !other || !inMyCopy(m, mine) || m.removed) {
      throw new ConvexError('NOT_FOUND');
    }
    const refusal = await writeRefusal(ctx, viewer, other.userId, other);
    if (refusal) throw new ConvexError(refusal);
    const others = (m.reactions ?? []).filter(
      (r) => r.userId !== viewer.userId,
    );
    const current = (m.reactions ?? []).find((r) => r.userId === viewer.userId);
    if ((current?.emoji ?? null) === emoji) return null;
    await enforceRateLimit(ctx, {
      key: `social:reaction:${viewer.userId}`,
      ...SOCIAL_RATE_LIMITS.reaction,
    });
    await ctx.db.patch(messageId, {
      reactions:
        emoji === null ? others : [...others, { userId: viewer.userId, emoji }],
    });
    return null;
  },
});

// --- "Is typing…" --------------------------------------------------------------

async function typingRow(
  ctx: QueryCtx,
  conversationId: Id<'conversations'>,
  userId: Id<'users'>,
) {
  return await ctx.db
    .query('conversationTyping')
    .withIndex('by_conversation_and_userId', (q) =>
      q.eq('conversationId', conversationId).eq('userId', userId),
    )
    .unique();
}

async function clearTyping(
  ctx: MutationCtx,
  conversationId: Id<'conversations'>,
  userId: Id<'users'>,
) {
  const row = await typingRow(ctx, conversationId, userId);
  if (row) await ctx.db.delete(row._id);
}

export const setTyping = mutation({
  args: { conversationId: v.id('conversations'), typing: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { conversationId, typing }) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) throw new Error('UNAUTHENTICATED');
    const { mine, other } = await myMembership(
      ctx,
      conversationId,
      viewer.userId,
    );
    if (!mine || !other) throw new ConvexError('NOT_FOUND');
    if (!typing) {
      await clearTyping(ctx, conversationId, viewer.userId);
      return null;
    }
    // Someone who cannot write does not signal that they are writing.
    if (await writeRefusal(ctx, viewer, other.userId, other)) return null;
    const until = Date.now() + TYPING_TTL_MS;
    const row = await typingRow(ctx, conversationId, viewer.userId);
    if (row) await ctx.db.patch(row._id, { until });
    else {
      await ctx.db.insert('conversationTyping', {
        conversationId,
        userId: viewer.userId,
        until,
      });
    }
    return null;
  },
});

// Until when the OTHER participant is shown as typing (`null`: not typing).
// The screen compares `until` with its own clock.
export const typingState = query({
  args: { conversationId: v.id('conversations') },
  returns: v.union(v.object({ until: v.number() }), v.null()),
  handler: async (ctx, { conversationId }) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) return null;
    const { mine, other } = await myMembership(
      ctx,
      conversationId,
      viewer.userId,
    );
    if (!mine || !other) return null;
    const row = await typingRow(ctx, conversationId, other.userId);
    return row ? { until: row.until } : null;
  },
});

export const sendNewMessageEmail = internalAction({
  args: { recipientId: v.id('users'), senderName: v.string() },
  returns: v.null(),
  handler: async (ctx, { recipientId, senderName }) => {
    const target: { email: string; locale: SiteLocale } | null =
      await ctx.runQuery(internal.social.messages.emailTarget, { recipientId });
    if (!target) return null;
    const { subject, html } = newMessageEmail({
      senderName,
      siteUrl: process.env.SITE_URL ?? 'http://localhost:3000',
      locale: target.locale,
    });
    await sendEmail({ to: target.email, subject, html });
    return null;
  },
});

export const emailTarget = internalQuery({
  args: { recipientId: v.id('users') },
  returns: v.union(v.object({ email: v.string(), locale }), v.null()),
  handler: async (ctx, { recipientId }) => {
    const user = await ctx.db.get(recipientId);
    const profile = await profileByUserId(ctx, recipientId);
    // Preference re-read at send time: if disabled in the meantime, nothing is sent.
    if (!user?.email || !profile?.messageEmail) return null;
    return { email: user.email, locale: user.preferredLocale ?? 'fr' };
  },
});

// --- Reading -----------------------------------------------------------------

const participantValidator = v.object({
  displayName: v.string(),
  // `null` when the profile is no longer visible to the reader (made private,
  // deleted): the name remains, the profile link and photo do not.
  handle: v.union(v.string(), v.null()),
  photoUrl: v.union(v.string(), v.null()),
});

async function participant(
  ctx: QueryCtx,
  viewer: NonNullable<Viewer>,
  userId: Id<'users'>,
) {
  const p = await profileByUserId(ctx, userId);
  if (!p) {
    const user = await ctx.db.get(userId);
    return {
      displayName: user?.name?.trim() ?? '',
      handle: null,
      photoUrl: null,
    };
  }
  const visible = await viewerCanSee(ctx, viewer, p);
  return {
    displayName: p.displayName,
    handle: visible ? p.handle : null,
    photoUrl: visible ? await photoUrl(ctx, p) : null,
  };
}

// Is the message in MY copy? (neither deleted by me, nor older than my
// clearing of the conversation)
function inMyCopy(
  m: Doc<'directMessages'>,
  mine: Doc<'conversationMembers'>,
): boolean {
  if (m.hiddenFor.includes(mine.userId)) return false;
  if (mine.clearedAt !== undefined && m.createdAt <= mine.clearedAt) {
    return false;
  }
  return true;
}

const CONVERSATIONS_MAX = 50;
const PREVIEW_SCAN = 10;
const PREVIEW_CHARS = 120;

export const listConversations = query({
  args: {},
  returns: v.array(
    v.object({
      conversationId: v.id('conversations'),
      other: participantValidator,
      unreadCount: v.number(),
      lastMessageAt: v.number(),
      preview: v.union(
        v.object({
          fromMe: v.boolean(),
          text: v.string(),
          removed: v.boolean(),
        }),
        v.null(),
      ),
      blocked: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) return [];
    const rows = await ctx.db
      .query('conversationMembers')
      .withIndex('by_user_and_lastMessageAt', (q) =>
        q.eq('userId', viewer.userId),
      )
      .order('desc')
      .take(CONVERSATIONS_MAX * 2);
    const out = [];
    for (const mine of rows) {
      if (mine.hidden) continue;
      if (out.length === CONVERSATIONS_MAX) break;
      const recent = await ctx.db
        .query('directMessages')
        .withIndex('by_conversation', (q) =>
          q.eq('conversationId', mine.conversationId),
        )
        .order('desc')
        .take(PREVIEW_SCAN);
      const last = recent.find((m) => inMyCopy(m, mine)) ?? null;
      out.push({
        conversationId: mine.conversationId,
        other: await participant(ctx, viewer, mine.otherUserId),
        unreadCount: mine.unreadCount,
        lastMessageAt: mine.lastMessageAt,
        preview: last
          ? {
              fromMe: last.senderId === viewer.userId,
              text: last.removed ? '' : last.body.slice(0, PREVIEW_CHARS),
              removed: last.removed === true,
            }
          : null,
        blocked: await isBlockedEitherWay(ctx, viewer.userId, mine.otherUserId),
      });
    }
    return out;
  },
});

// The conversation's HEADER: who, what one may still do, and how far the
// other person has read. The messages themselves are paginated
// (`listMessages`), newest first.
// TRANSITION: the screen deployed before this version reads `messages` and
// `truncated` here. Convex and the site deploy separately, so the backend
// keeps serving them to callers that do not pass `headerOnly` until every
// open tab runs the new screen. Remove once the new screen has shipped.
const LEGACY_THREAD_MAX = 200;
const legacyMessageValidator = v.object({
  _id: v.id('directMessages'),
  fromMe: v.boolean(),
  body: v.string(),
  removed: v.boolean(),
  createdAt: v.number(),
});

export const getConversation = query({
  args: {
    conversationId: v.id('conversations'),
    headerOnly: v.optional(v.boolean()),
  },
  returns: v.union(
    v.object({
      conversationId: v.id('conversations'),
      otherUserId: v.id('users'),
      other: participantValidator,
      unreadCount: v.number(),
      // My messages sent up to this instant have been seen ("Seen").
      otherLastReadAt: v.number(),
      // Messages at or before this instant were already read when I opened
      // the thread: the "new messages" divider goes after them.
      myLastReadAt: v.number(),
      // Why one cannot (or can no longer) reply; `null` = one can.
      refusal: v.union(
        v.literal('SELF'),
        v.literal('NOT_MEMBER'),
        v.literal('BLOCKED'),
        v.literal('POLICY'),
        v.null(),
      ),
      blockedByMe: v.boolean(),
      messages: v.optional(v.array(legacyMessageValidator)),
      truncated: v.optional(v.boolean()),
    }),
    v.null(),
  ),
  handler: async (ctx, { conversationId, headerOnly }) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) return null;
    const { mine, other } = await myMembership(
      ctx,
      conversationId,
      viewer.userId,
    );
    // A third party — including an administrator — NEVER reads a conversation.
    if (!mine || !other) return null;
    const header = {
      conversationId,
      otherUserId: other.userId,
      other: await participant(ctx, viewer, other.userId),
      unreadCount: mine.unreadCount,
      otherLastReadAt: other.lastReadAt,
      myLastReadAt: mine.lastReadAt,
      refusal: await writeRefusal(ctx, viewer, other.userId, other),
      blockedByMe: await isBlocked(ctx, viewer.userId, other.userId),
    };
    if (headerOnly) return header;
    const rows = await ctx.db
      .query('directMessages')
      .withIndex('by_conversation', (q) =>
        q.eq('conversationId', conversationId),
      )
      .order('desc')
      .take(LEGACY_THREAD_MAX);
    return {
      ...header,
      messages: rows
        .filter((m) => inMyCopy(m, mine))
        .reverse()
        .map((m) => ({
          _id: m._id,
          fromMe: m.senderId === viewer.userId,
          body: m.removed ? '' : m.body,
          removed: m.removed === true,
          createdAt: m.createdAt,
        })),
      truncated: rows.length === LEGACY_THREAD_MAX,
    };
  },
});

const REPLY_EXCERPT_CHARS = 140;
const MESSAGES_PAGE_MAX = 100;

const messageValidator = v.object({
  _id: v.id('directMessages'),
  fromMe: v.boolean(),
  body: v.string(),
  removed: v.boolean(),
  createdAt: v.number(),
  editedAt: v.union(v.number(), v.null()),
  // Quoted message, `null` when there is none or it left my copy.
  replyTo: v.union(
    v.object({
      _id: v.id('directMessages'),
      fromMe: v.boolean(),
      excerpt: v.string(),
      removed: v.boolean(),
    }),
    v.null(),
  ),
  // Who reacted is reduced to "me or the other person": the thread only has
  // two participants.
  reactions: v.array(v.object({ emoji: v.string(), mine: v.boolean() })),
});

// Messages of a conversation, NEWEST FIRST, page by page ("older messages"
// load as the reader scrolls up). Pages can come back shorter than asked:
// messages removed from my copy are skipped after the read.
export const listMessages = query({
  args: {
    conversationId: v.id('conversations'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, { conversationId, paginationOpts }) => {
    const empty = { page: [], isDone: true, continueCursor: '' };
    const viewer = await loadViewer(ctx);
    if (!viewer) return empty;
    const { mine, other } = await myMembership(
      ctx,
      conversationId,
      viewer.userId,
    );
    // Same rule as the header: a third party reads nothing.
    if (!mine || !other) return empty;
    const result = await ctx.db
      .query('directMessages')
      .withIndex('by_conversation', (q) =>
        q.eq('conversationId', conversationId),
      )
      .order('desc')
      .paginate({
        ...paginationOpts,
        numItems: Math.max(
          1,
          Math.min(MESSAGES_PAGE_MAX, paginationOpts.numItems),
        ),
      });
    const page = [];
    for (const m of result.page) {
      if (!inMyCopy(m, mine)) continue;
      let replyTo = null;
      if (m.replyToId !== undefined) {
        const q = await ctx.db.get(m.replyToId);
        if (q && inMyCopy(q, mine)) {
          replyTo = {
            _id: q._id,
            fromMe: q.senderId === viewer.userId,
            excerpt: q.removed ? '' : q.body.slice(0, REPLY_EXCERPT_CHARS),
            removed: q.removed === true,
          };
        }
      }
      page.push({
        _id: m._id,
        fromMe: m.senderId === viewer.userId,
        body: m.removed ? '' : m.body,
        removed: m.removed === true,
        createdAt: m.createdAt,
        editedAt: m.removed ? null : (m.editedAt ?? null),
        replyTo,
        reactions: m.removed
          ? []
          : (m.reactions ?? []).map((r) => ({
              emoji: r.emoji,
              mine: r.userId === viewer.userId,
            })),
      });
    }
    return { ...result, page };
  },
});

// Header badge: number of unread CONVERSATIONS, capped like
// the bell's (bounded read, constant cost).
export const UNREAD_CONVERSATIONS_CAP = 9;

export const unreadSummary = query({
  args: {},
  returns: v.object({ count: v.number(), capped: v.boolean() }),
  handler: async (ctx) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) return { count: 0, capped: false };
    const rows = await ctx.db
      .query('conversationMembers')
      .withIndex('by_user_and_hasUnread', (q) =>
        q.eq('userId', viewer.userId).eq('hasUnread', true),
      )
      .take(UNREAD_CONVERSATIONS_CAP + 1);
    return {
      count: Math.min(rows.length, UNREAD_CONVERSATIONS_CAP),
      capped: rows.length > UNREAD_CONVERSATIONS_CAP,
    };
  },
});

export const markRead = mutation({
  args: { conversationId: v.id('conversations') },
  returns: v.null(),
  handler: async (ctx, { conversationId }) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) throw new Error('UNAUTHENTICATED');
    const { mine } = await myMembership(ctx, conversationId, viewer.userId);
    if (!mine) throw new ConvexError('NOT_FOUND');
    // No needless write: the screen calls `markRead` on every render of the thread.
    if (mine.hasUnread || mine.unreadCount > 0) {
      await ctx.db.patch(mine._id, {
        unreadCount: 0,
        hasUnread: false,
        lastReadAt: Date.now(),
      });
    }
    return null;
  },
});

// --- Deleting one's copy ------------------------------------------------------

export const deleteMessage = mutation({
  args: { messageId: v.id('directMessages') },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) throw new Error('UNAUTHENTICATED');
    const m = await ctx.db.get(messageId);
    if (!m) throw new ConvexError('NOT_FOUND');
    const { mine, other } = await myMembership(
      ctx,
      m.conversationId,
      viewer.userId,
    );
    if (!mine) throw new ConvexError('NOT_FOUND');
    const hiddenFor = [...new Set([...m.hiddenFor, viewer.userId])];
    // Both copies deleted: the message no longer exists for anyone, it
    // is erased. An open report keeps the forwarded copy
    // (`bodySnapshot`) until it is resolved.
    if (!other || hiddenFor.includes(other.userId)) {
      await ctx.db.delete(messageId);
    } else {
      await ctx.db.patch(messageId, { hiddenFor });
    }
    return null;
  },
});

export const deleteConversation = mutation({
  args: { conversationId: v.id('conversations') },
  returns: v.null(),
  handler: async (ctx, { conversationId }) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) throw new Error('UNAUTHENTICATED');
    const { mine } = await myMembership(ctx, conversationId, viewer.userId);
    if (!mine) throw new ConvexError('NOT_FOUND');
    await ctx.db.patch(mine._id, {
      clearedAt: Date.now(),
      hidden: true,
      unreadCount: 0,
      hasUnread: false,
    });
    await ctx.scheduler.runAfter(0, internal.social.messages.purgeCleared, {
      conversationId,
    });
    return null;
  },
});

// Erases the messages that NO ONE can read anymore: older than both
// clearings of the conversation. In batches, and re-run as long as some remain.
const PURGE_BATCH = 200;

export const purgeCleared = internalMutation({
  args: { conversationId: v.id('conversations') },
  returns: v.null(),
  handler: async (ctx, { conversationId }) => {
    const rows = await membersOf(ctx, conversationId);
    if (rows.length < 2 || rows.some((r) => r.clearedAt === undefined)) {
      return null;
    }
    const cutoff = Math.min(...rows.map((r) => r.clearedAt ?? 0));
    const batch = await ctx.db
      .query('directMessages')
      .withIndex('by_conversation', (q) =>
        q.eq('conversationId', conversationId),
      )
      .take(PURGE_BATCH);
    const old = batch.filter((m) => m.createdAt <= cutoff);
    for (const m of old) await ctx.db.delete(m._id);
    if (old.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.social.messages.purgeCleared, {
        conversationId,
      });
    }
    return null;
  },
});

// --- Blocking -----------------------------------------------------------------

export const block = mutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) throw new Error('UNAUTHENTICATED');
    if (userId === viewer.userId) throw new ConvexError('SELF');
    if (await isBlocked(ctx, viewer.userId, userId)) return null;
    await enforceRateLimit(ctx, {
      key: `social:block:${viewer.userId}`,
      ...SOCIAL_RATE_LIMITS.block,
    });
    await ctx.db.insert('blocks', {
      blockerId: viewer.userId,
      blockedId: userId,
      createdAt: Date.now(),
    });
    // Blocking undoes following in both directions: you do not keep
    // receiving the activity of someone you blocked, nor showing yours to them.
    await removeFollow(ctx, viewer.userId, userId);
    await removeFollow(ctx, userId, viewer.userId);
    return null;
  },
});

export const unblock = mutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) throw new Error('UNAUTHENTICATED');
    const row = await ctx.db
      .query('blocks')
      .withIndex('by_blocker_and_blocked', (q) =>
        q.eq('blockerId', viewer.userId).eq('blockedId', userId),
      )
      .unique();
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

export const myBlocks = query({
  args: {},
  returns: v.array(
    v.object({ userId: v.id('users'), displayName: v.string() }),
  ),
  handler: async (ctx) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) return [];
    const rows = await ctx.db
      .query('blocks')
      .withIndex('by_blocker_and_blocked', (q) =>
        q.eq('blockerId', viewer.userId),
      )
      .take(200);
    const out = [];
    for (const r of rows) {
      const p = await profileByUserId(ctx, r.blockedId);
      const user = p ? null : await ctx.db.get(r.blockedId);
      out.push({
        userId: r.blockedId,
        displayName: p?.displayName ?? user?.name?.trim() ?? '',
      });
    }
    return out;
  },
});

// --- Reporting -------------------------------------------------------------

export const reportMessage = mutation({
  args: { messageId: v.id('directMessages'), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { messageId, reason }) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) throw new Error('UNAUTHENTICATED');
    const m = await ctx.db.get(messageId);
    if (!m) throw new ConvexError('NOT_FOUND');
    const { mine } = await myMembership(ctx, m.conversationId, viewer.userId);
    // Only a participant can report — and only a message they received.
    if (!mine) throw new ConvexError('NOT_FOUND');
    if (m.senderId === viewer.userId) throw new ConvexError('OWN_MESSAGE');
    const text = reason?.trim() ?? '';
    if (text.length > REPORT_REASON_MAX)
      throw new ConvexError('INVALID_REASON');
    await enforceRateLimit(ctx, {
      key: `social:report:${viewer.userId}`,
      ...SOCIAL_RATE_LIMITS.report,
    });
    const existing = await ctx.db
      .query('messageReports')
      .withIndex('by_message_and_reporter', (q) =>
        q.eq('messageId', messageId).eq('reporterId', viewer.userId),
      )
      .filter((q) => q.eq(q.field('resolved'), false))
      .first();
    // Idempotent: a second report of the same message does not double the queue.
    if (existing) return null;
    await ctx.db.insert('messageReports', {
      messageId,
      conversationId: m.conversationId,
      reporterId: viewer.userId,
      reportedUserId: m.senderId,
      reason: text || undefined,
      bodySnapshot: m.removed ? undefined : m.body,
      resolved: false,
      createdAt: Date.now(),
    });
    return null;
  },
});

// --- Back office: report queue (moderator and above) ---------------

const REPORTS_MAX = 200;

export const listReports = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('messageReports'),
      excerpt: v.string(),
      reason: v.union(v.string(), v.null()),
      reportedName: v.string(),
      reportedHandle: v.union(v.string(), v.null()),
      messageGone: v.boolean(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'moderateur');
    const reports = await ctx.db
      .query('messageReports')
      .withIndex('by_resolved', (q) => q.eq('resolved', false))
      .order('desc')
      .take(REPORTS_MAX);
    const out = [];
    for (const r of reports) {
      const p = await profileByUserId(ctx, r.reportedUserId);
      const user = p ? null : await ctx.db.get(r.reportedUserId);
      const message = await ctx.db.get(r.messageId);
      out.push({
        _id: r._id,
        // The moderator reads the FORWARDED COPY made at report time,
        // not the live message: they only see what the person chose
        // to show them, and nothing else of the conversation.
        excerpt: r.bodySnapshot ?? '',
        reason: r.reason ?? null,
        reportedName: p?.displayName ?? user?.name?.trim() ?? '',
        reportedHandle: p?.handle ?? null,
        messageGone: !message || message.removed === true,
        createdAt: r.createdAt,
      });
    }
    return out;
  },
});

export const resolveReport = mutation({
  args: {
    reportId: v.id('messageReports'),
    action: v.union(v.literal('dismiss'), v.literal('remove')),
  },
  returns: v.null(),
  handler: async (ctx, { reportId, action }) => {
    const mod = await requireNetworkRole(ctx, 'moderateur');
    const report = await ctx.db.get(reportId);
    if (!report) throw new ConvexError('NOT_FOUND');
    if (action === 'remove') {
      const m = await ctx.db.get(report.messageId);
      if (m && !m.removed) {
        await ctx.db.patch(m._id, { removed: true, body: '' });
      }
    }
    // All OPEN reports of the same message are decided at once
    // (several people cannot report it — only the recipient
    // reads it —, but the same recipient can come back to it after resolution).
    const siblings = await ctx.db
      .query('messageReports')
      .withIndex('by_resolved', (q) => q.eq('resolved', false))
      .filter((q) => q.eq(q.field('messageId'), report.messageId))
      .take(50);
    const resolution = action === 'remove' ? 'removed' : 'dismissed';
    for (const r of [report, ...siblings.filter((s) => s._id !== report._id)]) {
      // Minimization: the forwarded copy has no further use once decided.
      await ctx.db.patch(r._id, {
        resolved: true,
        resolution,
        bodySnapshot: undefined,
      });
    }
    // The log says WHO decided WHAT — never the message content.
    await recordAudit(ctx, {
      actorId: mod._id,
      action: AUDIT.MESSAGE_REPORT_RESOLVED,
      targetId: reportId,
      metadata: { action },
    });
    return null;
  },
});

import { v, ConvexError } from 'convex/values';
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

// MESSAGERIE PRIVÉE 1:1, temps réel (les queries Convex sont réactives : la
// liste, le fil et la pastille d'en-tête se mettent à jour sans recharger).
//
// Trois règles tiennent tout le module :
//  1. seuls les DEUX participants lisent une conversation. Un tiers — fût-il
//     administrateur — reçoit `null`, exactement comme pour un identifiant
//     inexistant. La modération ne voit qu'un message SIGNALÉ, transmis par
//     la personne qui le signale ;
//  2. aucun contenu de message ne sort de ce module ailleurs que vers ses
//     participants : ni journal d'audit, ni notification, ni courriel (« nouveau
//     message de X », sans plus), ni `console.log` ;
//  3. le réglage « qui peut m'écrire » et le blocage sont vérifiés À CHAQUE
//     envoi, pas seulement à l'ouverture de la conversation.

// --- Faits et décision ---------------------------------------------------------

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
    // Sans profil (supprimé), personne ne peut plus écrire à ce compte.
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
  },
) {
  const now = Date.now();
  const { conversationId, mine, other } = args;
  const messageId = await ctx.db.insert('directMessages', {
    conversationId,
    senderId: mine.userId,
    body: args.body,
    createdAt: now,
    hiddenFor: [],
  });
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

  // Notification in-app au PASSAGE à « non lu » seulement : une rafale de
  // dix messages ne sonne qu'une fois. Le titre ne porte que le nom.
  if (!other.hasUnread) {
    await notify(ctx, {
      userId: other.userId,
      type: SOCIAL_NOTIF.MESSAGE,
      titleKey: 'socialMessage',
      params: { name: args.senderName },
      link: `/espace-membre/messages?c=${conversationId}`,
    });
  }

  // Courriel « nouveau message de X » : opt-in, au plus un par conversation
  // et par demi-heure, et seulement si un fournisseur existe — sinon l'envoi
  // échouerait en production (fail-closed de `sendEmail`).
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

// --- Envoi -------------------------------------------------------------------

// Premier message à une personne (depuis son profil). Réutilise la
// conversation existante s'il y en a une : une seule conversation par couple.
export const startConversation = mutation({
  args: { userId: v.id('users'), body: v.string() },
  returns: v.id('conversations'),
  handler: async (ctx, { userId, body }) => {
    const viewer = await requireSocialMember(ctx);
    const me = await profileByUserId(ctx, viewer.userId);
    if (!me) throw new ConvexError('PROFILE_REQUIRED');
    const text = cleanBody(body);
    const target = await profileByUserId(ctx, userId);
    // Un profil invisible est un profil inexistant : même refus, pour que
    // `startConversation` ne devienne pas un oracle des profils privés.
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
  args: { conversationId: v.id('conversations'), body: v.string() },
  returns: v.id('directMessages'),
  handler: async (ctx, { conversationId, body }) => {
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
    });
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
    // Préférence relue au moment de l'envoi : désactivée entre-temps, rien ne part.
    if (!user?.email || !profile?.messageEmail) return null;
    return { email: user.email, locale: user.preferredLocale ?? 'fr' };
  },
});

// --- Lecture -----------------------------------------------------------------

const participantValidator = v.object({
  displayName: v.string(),
  // `null` quand le profil n'est plus visible du lecteur (devenu privé,
  // supprimé) : le nom reste, le lien vers le profil et la photo non.
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

// Le message est-il dans MA copie ? (ni supprimé par moi, ni antérieur à mon
// effacement de la conversation)
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

const THREAD_MAX = 200;

export const getConversation = query({
  args: { conversationId: v.id('conversations') },
  returns: v.union(
    v.object({
      conversationId: v.id('conversations'),
      otherUserId: v.id('users'),
      other: participantValidator,
      unreadCount: v.number(),
      messages: v.array(
        v.object({
          _id: v.id('directMessages'),
          fromMe: v.boolean(),
          body: v.string(),
          removed: v.boolean(),
          createdAt: v.number(),
        }),
      ),
      // Les plus anciens ne sont pas servis au-delà de THREAD_MAX.
      truncated: v.boolean(),
      // Pourquoi l'on ne peut pas (ou plus) répondre ; `null` = on peut.
      refusal: v.union(
        v.literal('SELF'),
        v.literal('NOT_MEMBER'),
        v.literal('BLOCKED'),
        v.literal('POLICY'),
        v.null(),
      ),
      blockedByMe: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, { conversationId }) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) return null;
    const { mine, other } = await myMembership(
      ctx,
      conversationId,
      viewer.userId,
    );
    // Un tiers — y compris un administrateur — ne lit JAMAIS une conversation.
    if (!mine || !other) return null;
    const rows = await ctx.db
      .query('directMessages')
      .withIndex('by_conversation', (q) =>
        q.eq('conversationId', conversationId),
      )
      .order('desc')
      .take(THREAD_MAX);
    const messages = rows
      .filter((m) => inMyCopy(m, mine))
      .reverse()
      .map((m) => ({
        _id: m._id,
        fromMe: m.senderId === viewer.userId,
        body: m.removed ? '' : m.body,
        removed: m.removed === true,
        createdAt: m.createdAt,
      }));
    return {
      conversationId,
      otherUserId: other.userId,
      other: await participant(ctx, viewer, other.userId),
      unreadCount: mine.unreadCount,
      messages,
      truncated: rows.length === THREAD_MAX,
      refusal: await writeRefusal(ctx, viewer, other.userId, other),
      blockedByMe: await isBlocked(ctx, viewer.userId, other.userId),
    };
  },
});

// Pastille de l'en-tête : nombre de CONVERSATIONS non lues, plafonné comme
// celui de la cloche (lecture bornée, coût constant).
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
    // Pas d'écriture inutile : l'écran appelle `markRead` à chaque rendu du fil.
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

// --- Suppression de sa copie ------------------------------------------------------

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
    // Les deux copies supprimées : le message n'existe plus pour personne, il
    // est effacé. Un signalement ouvert en garde la transmission
    // (`bodySnapshot`) jusqu'à sa résolution.
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

// Efface les messages que PLUS PERSONNE ne peut lire : antérieurs aux deux
// effacements de la conversation. Par lots, et relancée tant qu'il en reste.
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

// --- Blocage -----------------------------------------------------------------

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
    // Le blocage défait le suivi dans les deux sens : on ne continue pas de
    // recevoir l'activité de quelqu'un qu'on a bloqué, ni de la lui montrer.
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

// --- Signalement -------------------------------------------------------------

export const reportMessage = mutation({
  args: { messageId: v.id('directMessages'), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { messageId, reason }) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) throw new Error('UNAUTHENTICATED');
    const m = await ctx.db.get(messageId);
    if (!m) throw new ConvexError('NOT_FOUND');
    const { mine } = await myMembership(ctx, m.conversationId, viewer.userId);
    // Seul un participant signale — et seulement un message qu'il a reçu.
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
    // Idempotent : un second signalement du même message ne double pas la file.
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

// --- Back-office : file des signalements (modérateur et au-dessus) ---------------

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
        // Le modérateur lit la TRANSMISSION faite au moment du signalement,
        // pas le message vivant : il ne voit que ce que la personne a choisi
        // de lui montrer, et rien d'autre de la conversation.
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
    // Tous les signalements OUVERTS du même message sont tranchés d'un coup
    // (plusieurs personnes ne peuvent pas le signaler — seul le destinataire
    // le lit —, mais un même destinataire peut y revenir après résolution).
    const siblings = await ctx.db
      .query('messageReports')
      .withIndex('by_resolved', (q) => q.eq('resolved', false))
      .filter((q) => q.eq(q.field('messageId'), report.messageId))
      .take(50);
    const resolution = action === 'remove' ? 'removed' : 'dismissed';
    for (const r of [report, ...siblings.filter((s) => s._id !== report._id)]) {
      // Minimisation : la transmission n'a plus d'usage une fois tranchée.
      await ctx.db.patch(r._id, {
        resolved: true,
        resolution,
        bodySnapshot: undefined,
      });
    }
    // Le journal dit QUI a tranché QUOI — jamais le contenu du message.
    await recordAudit(ctx, {
      actorId: mod._id,
      action: AUDIT.MESSAGE_REPORT_RESOLVED,
      targetId: reportId,
      metadata: { action },
    });
    return null;
  },
});

import { v, ConvexError } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id, Doc } from './_generated/dataModel';
import { requireNetworkRole, requireUser, getActiveUserId } from './lib/rbac';
import { roleRank } from './lib/roles';
import { TRIBUNE_BODY, TRIBUNE_COMMENT, isEmail } from './lib/validation';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { normalizeEmail } from './lib/onboarding';
import { isNetworkTheme, networkThemeValidator } from './lib/themes';
import { slugify } from './lib/slug';
import { locale } from './schema';
import { tribuneSearchText, yearOf } from './lib/searchText';
import {
  trackPublicationStatus,
  trackTribunePostStatus,
  trackTribuneCommentStatus,
} from './lib/counters';
import { contentStatusValidator, excerpt } from './lib/communaute';
import {
  loadCommunitySettings,
  logModerationEvent,
  scheduleTribuneAiReview,
} from './lib/moderationHistory';
import { loadSettings as loadAiSettings } from './aiModeration';
import { internal } from './_generated/api';
import { enqueueTranslations } from './translationJobs';

// Public shapes of the Tribune. The handlers already projected field by
// field; declaring them here FREEZES that projection: the day one of them
// returns `{ ...post }`, the query will fail instead of serving `authorUserId`,
// `status` and the full body of withdrawn posts (issue #30).
const postSummaryValidator = v.object({
  _id: v.id('tribunePosts'),
  theme: v.string(),
  format: v.union(v.literal('court'), v.literal('fond')),
  title: v.string(),
  excerpt: v.string(),
  // Writing language, for the `lang` attribute of the title and excerpt in
  // the FEED (RGAA 8.7) — the entry page already received it. Optional for the same
  // reason as below: posts predating the field do not carry it.
  lang: v.optional(locale),
  authorName: v.string(),
  commentCount: v.number(),
  createdAt: v.number(),
  // Long-form contribution that extends a short post (F-48).
  isDeepening: v.boolean(),
});

const linkedPostValidator = v.object({
  _id: v.id('tribunePosts'),
  title: v.string(),
  authorName: v.string(),
  createdAt: v.number(),
});

const postDetailValidator = v.object({
  _id: v.id('tribunePosts'),
  theme: v.string(),
  format: v.union(v.literal('court'), v.literal('fond')),
  title: v.string(),
  body: v.string(),
  // Writing language: the entry page needs it for its canonical and for
  // the article's `lang` attribute (issue #35). Absent on posts
  // predating the field — the fallback belongs to `resolveLocale`, on the Next side.
  lang: v.optional(locale),
  authorName: v.string(),
  commentCount: v.number(),
  createdAt: v.number(),
  comments: v.array(
    v.object({
      _id: v.id('tribuneComments'),
      authorName: v.string(),
      body: v.string(),
      createdAt: v.number(),
    }),
  ),
  // DEEPENING (F-48) — the two pieces of content point to each other,
  // publicly: the short post lists its PUBLISHED long-form contributions,
  // the long-form contribution names the post it extends.
  parent: v.union(linkedPostValidator, v.null()),
  deepenings: v.array(linkedPostValidator),
});

// Democratic Tribune (F-44/F-47/F-50). Public read, member write.
// PRE-moderation by default (F-45, community workstream): a submitted post
// stays `pending`, invisible to the public, until a moderator decides
// (convex/communityModeration.ts). The administrator can switch back to
// post-moderation. `theme` = one of the network's 5 axes.

function authorName(user: Doc<'users'>): string {
  return user.name?.trim() || 'Membre';
}

// --- Effects of going live ----------------------------------------------
//
// What the PUBLICATION of content triggers, whether it comes from the submission
// (post-moderation), a moderator or the AI (pre-moderation). Written once, called
// from all three paths: notifications and counters no longer follow the
// author's action, but the moment the public sees the content.

export async function onPostPublished(
  ctx: MutationCtx,
  post: Doc<'tribunePosts'>,
  from: Doc<'tribunePosts'>['status'] | null,
): Promise<void> {
  await trackTribunePostStatus(ctx, from, 'published');
  // Translated into the other site languages as soon as the public sees it.
  await enqueueTranslations(ctx, 'tribunePost', post._id);
  // A long-form contribution is published: the author of the post it extends
  // is told (unless they are its author themselves).
  if (post.parentPostId) {
    const parent = await ctx.db.get(post.parentPostId);
    if (parent && parent.authorUserId !== post.authorUserId) {
      await notify(ctx, {
        userId: parent.authorUserId,
        type: 'tribune_deepened',
        titleKey: 'tribuneDeepened',
        params: { title: parent.title },
        link: `/tribune/${post._id}`,
      });
    }
  }
}

export async function onCommentPublished(
  ctx: MutationCtx,
  comment: Doc<'tribuneComments'>,
  from: Doc<'tribuneComments'>['status'] | null,
): Promise<void> {
  const post = await ctx.db.get(comment.postId);
  await trackTribuneCommentStatus(ctx, from, 'published');
  if (!post) return;
  await ctx.db.patch(post._id, { commentCount: post.commentCount + 1 });

  // Distinct participants (authors of the OTHER published comments in the thread).
  // Used to notify the other contributors. F-25/F-51.
  const existingComments = await ctx.db
    .query('tribuneComments')
    .withIndex('by_post', (q) => q.eq('postId', post._id))
    .take(1000);
  const participantIds = new Set<Id<'users'>>();
  for (const c of existingComments) {
    if (c.status === 'published' && c._id !== comment._id)
      participantIds.add(c.authorUserId);
  }
  // The commenter never notifies themselves, and the post author is
  // notified separately (no duplicate).
  participantIds.delete(comment.authorUserId);
  participantIds.delete(post.authorUserId);

  if (post.authorUserId !== comment.authorUserId) {
    await notify(ctx, {
      userId: post.authorUserId,
      type: 'tribune_comment',
      titleKey: 'tribuneComment',
      params: { title: post.title },
      link: `/tribune/${post._id}`,
    });
  }
  for (const userId of participantIds) {
    await notify(ctx, {
      userId,
      type: 'tribune_thread',
      titleKey: 'tribuneThreadReply',
      params: { title: post.title },
      link: `/tribune/${post._id}`,
    });
  }
}

// Can a member open a long-form contribution on this post? Its
// author, or a member they invited (pending invitation).
async function canDeepen(
  ctx: QueryCtx,
  parent: Doc<'tribunePosts'>,
  user: Doc<'users'>,
): Promise<boolean> {
  if (parent.authorUserId === user._id) return true;
  const byUser = await ctx.db
    .query('tribuneDeepeningInvites')
    .withIndex('by_user', (q) => q.eq('invitedUserId', user._id))
    .take(200);
  if (byUser.some((i) => i.postId === parent._id && i.status === 'pending'))
    return true;
  if (!user.email) return false;
  const byEmail = await ctx.db
    .query('tribuneDeepeningInvites')
    .withIndex('by_email', (q) => q.eq('email', normalizeEmail(user.email!)))
    .take(200);
  return byEmail.some((i) => i.postId === parent._id && i.status === 'pending');
}

// A PUBLISHED short post is the only one that can be deepened: a long-form
// contribution does not extend a text the public cannot see.
function isDeepenable(post: Doc<'tribunePosts'> | null): boolean {
  return !!post && post.status === 'published' && post.format === 'court';
}

// --- Writing (member and above) -----------------------------------------
export const createPost = mutation({
  args: {
    theme: v.string(),
    format: v.union(v.literal('court'), v.literal('fond')),
    title: v.string(),
    body: v.string(),
    // Declared by the author (the composer pre-fills it with the interface
    // language, without imposing it: one may write in English from a French
    // interface). Closed vocabulary: a value outside `locale` is rejected by
    // the validator, never silently folded back.
    lang: locale,
    // DEEPENING (F-48): the short post that this long-form
    // contribution extends.
    parentPostId: v.optional(v.id('tribunePosts')),
  },
  returns: v.id('tribunePosts'),
  handler: async (ctx, args) => {
    const user = await requireNetworkRole(ctx, 'membre');
    let theme = args.theme.trim();
    const title = args.title.trim();
    const body = args.body.trim();

    if (args.parentPostId) {
      const parent = await ctx.db.get(args.parentPostId);
      if (!parent || !isDeepenable(parent)) {
        throw new ConvexError('NOT_DEEPENABLE');
      }
      if (!(await canDeepen(ctx, parent, user))) {
        throw new ConvexError('NOT_INVITED');
      }
      // A long-form contribution is… long-form: long format (F-46 bounds), and
      // on the axis of the post it extends.
      if (args.format !== 'fond') throw new ConvexError('DEEPENING_FORMAT');
      theme = parent.theme;
    }

    if (!isNetworkTheme(theme)) throw new Error('INVALID_THEME');
    if (title.length < 4 || title.length > 160)
      throw new Error('INVALID_TITLE');
    // Bounds PER FORMAT (F-46, A-05): a "Brève" does not have the length
    // of an "Analyse". `ConvexError` and not `Error`: the code travels
    // all the way to the browser (a bare `Error` message is masked in prod), and
    // the composer can say "too long for this format" instead of a generic
    // failure — which is what 21,000 characters produced on 27/09.
    const bounds = TRIBUNE_BODY[args.format];
    if (body.length < bounds.min) throw new ConvexError('INVALID_BODY');
    if (body.length > bounds.max) throw new ConvexError('BODY_TOO_LONG');

    await enforceRateLimit(ctx, {
      key: `tribunePost:${user._id}`,
      ...RATE_LIMITS.tribunePost,
    });

    const now = Date.now();
    const name = authorName(user);
    // PRE-moderation (default): pending, invisible to the public. POST-moderation:
    // published immediately, moderated upon report.
    const { postMode } = await loadCommunitySettings(ctx);
    const status: 'pending' | 'published' =
      postMode === 'a_priori' ? 'pending' : 'published';

    const postId = await ctx.db.insert('tribunePosts', {
      authorUserId: user._id,
      authorName: name,
      theme,
      format: args.format,
      title,
      body,
      lang: args.lang,
      status,
      commentCount: 0,
      createdAt: now,
      // Global search (diffusion workstream): haystack maintained on write.
      searchText: tribuneSearchText({ title, body, authorName: name }),
      searchYear: yearOf(now),
      ...(args.parentPostId ? { parentPostId: args.parentPostId } : {}),
    });
    await logModerationEvent(ctx, {
      targetType: 'post',
      targetId: postId,
      postId,
      kind: 'submitted',
      actorId: user._id,
      statusTo: status,
    });
    if (status === 'published') {
      const post = await ctx.db.get(postId);
      if (post) await onPostPublished(ctx, post, null);
    }
    await scheduleTribuneAiReview(ctx, 'post', postId);
    return postId;
  },
});

// Edit ONE'S OWN post while it is not live: pending (correction
// before decision) or rejected (rework after reason). A post rejected then
// corrected goes back into the queue — it is a new submission, which a human reviews.
// The history keeps a record of the edit.
export const updatePost = mutation({
  args: {
    postId: v.id('tribunePosts'),
    title: v.string(),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const post = await ctx.db.get(args.postId);
    if (!post || post.authorUserId !== user._id) {
      throw new ConvexError('NOT_FOUND');
    }
    if (post.status !== 'pending' && post.status !== 'rejected') {
      throw new ConvexError('NOT_EDITABLE');
    }
    const title = args.title.trim();
    const body = args.body.trim();
    if (title.length < 4 || title.length > 160)
      throw new ConvexError('INVALID_TITLE');
    const bounds = TRIBUNE_BODY[post.format];
    if (body.length < bounds.min) throw new ConvexError('INVALID_BODY');
    if (body.length > bounds.max) throw new ConvexError('BODY_TOO_LONG');
    await enforceRateLimit(ctx, {
      key: `tribuneEdit:${user._id}`,
      ...RATE_LIMITS.tribuneEdit,
    });

    await ctx.db.patch(post._id, {
      title,
      body,
      // The search haystack follows the text (diffusion workstream): a post
      // corrected then approved must be findable by its NEW words.
      searchText: tribuneSearchText({
        title,
        body,
        authorName: post.authorName,
      }),
      status: 'pending',
      updatedAt: Date.now(),
      rejectionReason: undefined,
      aiReview: undefined,
    });
    await logModerationEvent(ctx, {
      targetType: 'post',
      targetId: post._id,
      postId: post._id,
      kind: 'edited',
      actorId: user._id,
      statusFrom: post.status,
      statusTo: 'pending',
    });
    await scheduleTribuneAiReview(ctx, 'post', post._id);
    return null;
  },
});

export const addComment = mutation({
  args: { postId: v.id('tribunePosts'), body: v.string() },
  // `status` tells the screen whether the comment is live or awaiting
  // moderation (comment pre-moderation mode).
  returns: v.object({
    ok: v.boolean(),
    status: v.union(v.literal('published'), v.literal('pending')),
  }),
  handler: async (ctx, { postId, body }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const text = body.trim();
    // `ConvexError`: the refusal ("1 caractère", "4 001 caractères") was
    // swallowed by the form for lack of a client-readable code (A-06).
    if (text.length < TRIBUNE_COMMENT.min || text.length > TRIBUNE_COMMENT.max)
      throw new ConvexError('INVALID_COMMENT');
    const post = await ctx.db.get(postId);
    if (!post || post.status !== 'published') throw new Error('NOT_FOUND');

    await enforceRateLimit(ctx, {
      key: `tribuneComment:${user._id}`,
      ...RATE_LIMITS.tribuneComment,
    });

    const { commentMode } = await loadCommunitySettings(ctx);
    const status: 'pending' | 'published' =
      commentMode === 'a_priori' ? 'pending' : 'published';

    const commentId = await ctx.db.insert('tribuneComments', {
      postId,
      authorUserId: user._id,
      authorName: authorName(user),
      body: text,
      status,
      createdAt: Date.now(),
    });
    await logModerationEvent(ctx, {
      targetType: 'comment',
      targetId: commentId,
      postId,
      kind: 'submitted',
      actorId: user._id,
      statusTo: status,
    });
    if (status === 'published') {
      const comment = await ctx.db.get(commentId);
      if (comment) await onCommentPublished(ctx, comment, null);
    }
    await scheduleTribuneAiReview(ctx, 'comment', commentId);
    return { ok: true, status };
  },
});

// "Support" reaction (like a like) — reserved for members. One reaction per
// member per post: toggle. Returns the state after toggling.
export const toggleReaction = mutation({
  args: { postId: v.id('tribunePosts') },
  returns: v.object({ reacted: v.boolean() }),
  handler: async (ctx, { postId }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const post = await ctx.db.get(postId);
    if (!post || post.status !== 'published') throw new Error('NOT_FOUND');

    const existing = await ctx.db
      .query('tribuneReactions')
      .withIndex('by_post_and_user', (q) =>
        q.eq('postId', postId).eq('userId', user._id),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { reacted: false };
    }
    await ctx.db.insert('tribuneReactions', {
      postId,
      userId: user._id,
      createdAt: Date.now(),
    });
    return { reacted: true };
  },
});

// Report (F-50) — any authenticated account can report.
export const reportContent = mutation({
  args: {
    targetType: v.union(v.literal('post'), v.literal('comment')),
    targetId: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { targetType, targetId, reason }) => {
    const user = await requireUser(ctx);
    await enforceRateLimit(ctx, {
      key: `tribuneReport:${user._id}`,
      ...RATE_LIMITS.tribuneReport,
    });
    // The target must be a Convex identifier from the RIGHT table, and exist
    // (audit M1 / pentest H-2). Without this validation, any
    // authenticated account could write an arbitrary string here: `listReports`
    // then re-read it via ctx.db.get and the moderation queue became
    // inaccessible to ALL moderators — with no way to resolve the
    // offending report, which can only be resolved from that same page.
    let postId: Id<'tribunePosts'> | undefined;
    let normalized: string;
    if (targetType === 'post') {
      const id = ctx.db.normalizeId('tribunePosts', targetId);
      if (!id || !(await ctx.db.get(id))) throw new Error('INVALID_TARGET');
      normalized = id;
      postId = id;
    } else {
      const id = ctx.db.normalizeId('tribuneComments', targetId);
      const c = id ? await ctx.db.get(id) : null;
      if (!id || !c) throw new Error('INVALID_TARGET');
      normalized = id;
      postId = c.postId;
    }
    // One OPEN report per person per target: by reloading the page,
    // the same account could report the same post at will, and the
    // moderators' queue filled with duplicates (measured on 27/09). The second
    // call is idempotent — the screen says "signalé" in both cases.
    const existing = await ctx.db
      .query('tribuneReports')
      .withIndex('by_target', (q) => q.eq('targetId', normalized))
      .filter((q) =>
        q.and(
          q.eq(q.field('resolved'), false),
          q.eq(q.field('reporterUserId'), user._id),
        ),
      )
      .first();
    if (existing) return { ok: true } as const;
    const cleanReason = reason?.trim().slice(0, 1000) || undefined;
    await ctx.db.insert('tribuneReports', {
      targetType,
      targetId: normalized,
      reason: cleanReason,
      reporterUserId: user._id,
      resolved: false,
      createdAt: Date.now(),
    });
    // The report enters the content's HISTORY (F-49).
    await logModerationEvent(ctx, {
      targetType,
      targetId: normalized,
      postId,
      kind: 'reported',
      actorId: user._id,
      ...(cleanReason ? { reason: cleanReason } : {}),
    });
    return { ok: true };
  },
});

// --- Public read --------------------------------------------------------
export const listPosts = query({
  // `theme` is a CLOSED domain: the validator says so, rather than letting
  // any string through only to filter it afterwards in the handler.
  // The caller (src/app/[locale]/tribune/page.tsx) sanitizes the URL parameter
  // upstream, so that a bogus `?theme=` stays "no filter" instead of
  // becoming an argument error on a public page.
  args: { theme: v.optional(networkThemeValidator) },
  returns: v.array(postSummaryValidator),
  handler: async (ctx, { theme }) => {
    // ONLY `published` posts: a pending, rejected or withdrawn post
    // does not exist for the public.
    const posts = theme
      ? await ctx.db
          .query('tribunePosts')
          .withIndex('by_status_and_theme', (q) =>
            q.eq('status', 'published').eq('theme', theme),
          )
          .order('desc')
          .take(100)
      : await ctx.db
          .query('tribunePosts')
          .withIndex('by_status', (q) => q.eq('status', 'published'))
          .order('desc')
          .take(100);
    return posts
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => ({
        _id: p._id,
        theme: p.theme,
        format: p.format,
        title: p.title,
        excerpt: p.body.length > 220 ? `${p.body.slice(0, 220)}…` : p.body,
        lang: p.lang,
        authorName: p.authorName,
        commentCount: p.commentCount,
        createdAt: p.createdAt,
        isDeepening: p.parentPostId !== undefined,
      }));
  },
});

function linked(p: Doc<'tribunePosts'>) {
  return {
    _id: p._id,
    title: p.title,
    authorName: p.authorName,
    createdAt: p.createdAt,
  };
}

export const getPost = query({
  args: { postId: v.id('tribunePosts') },
  returns: v.union(postDetailValidator, v.null()),
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get(postId);
    if (!post || post.status !== 'published') return null;
    const comments = await ctx.db
      .query('tribuneComments')
      .withIndex('by_post', (q) => q.eq('postId', postId))
      .take(1000);
    const parent = post.parentPostId
      ? await ctx.db.get(post.parentPostId)
      : null;
    const deepenings = await ctx.db
      .query('tribunePosts')
      .withIndex('by_parent_and_status', (q) =>
        q.eq('parentPostId', postId).eq('status', 'published'),
      )
      .take(20);
    return {
      _id: post._id,
      theme: post.theme,
      format: post.format,
      title: post.title,
      body: post.body,
      lang: post.lang,
      authorName: post.authorName,
      commentCount: post.commentCount,
      createdAt: post.createdAt,
      comments: comments
        .filter((c) => c.status === 'published')
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((c) => ({
          _id: c._id,
          authorName: c.authorName,
          body: c.body,
          createdAt: c.createdAt,
        })),
      // The link to the short post is only served if it is itself
      // live: a withdrawn post is not discovered through its contributions.
      parent: parent && parent.status === 'published' ? linked(parent) : null,
      deepenings: deepenings
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(linked),
    };
  },
});

// Reaction state of a post: count + whether the current user has reacted.
// Public read: `mine` is false for an anonymous visitor (no throw).
export const reactionState = query({
  args: { postId: v.id('tribunePosts') },
  returns: v.object({ count: v.number(), mine: v.boolean() }),
  handler: async (ctx, { postId }) => {
    const reactions = await ctx.db
      .query('tribuneReactions')
      .withIndex('by_post_and_user', (q) => q.eq('postId', postId))
      .take(5000);
    const userId = await getActiveUserId(ctx);
    const mine = userId ? reactions.some((r) => r.userId === userId) : false;
    return { count: reactions.length, mine };
  },
});

// Moderation setting in force, so the screen can say BEFORE sending what
// will happen ("soumis à validation" or "publié aussitôt"). Public: it
// is not a secret, it is a house rule.
export const moderationPolicy = query({
  args: {},
  returns: v.object({
    postMode: v.union(v.literal('a_priori'), v.literal('a_posteriori')),
    commentMode: v.union(v.literal('a_priori'), v.literal('a_posteriori')),
  }),
  handler: async (ctx) => await loadCommunitySettings(ctx),
});

// --- My posts (author) ----------------------------------------------------
// A member sees the STATE of their own contributions (F-45): pending,
// published, rejected (with the reason), withdrawn. The body is not returned here:
// the list gives the state; the full preview goes through `getOwnPost`.
// An anonymous visitor receives an empty list, not an error: the query is
// mounted on a public page.
const MY_POSTS_MAX = 50;

const myPostValidator = v.object({
  _id: v.id('tribunePosts'),
  theme: v.string(),
  format: v.union(v.literal('court'), v.literal('fond')),
  title: v.string(),
  status: contentStatusValidator,
  rejectionReason: v.union(v.string(), v.null()),
  parentPostId: v.union(v.id('tribunePosts'), v.null()),
  libraryPublicationId: v.union(v.id('publications'), v.null()),
  commentCount: v.number(),
  createdAt: v.number(),
});

export const myPosts = query({
  args: {},
  returns: v.array(myPostValidator),
  handler: async (ctx) => {
    const userId = await getActiveUserId(ctx);
    if (!userId) return [];
    const posts = await ctx.db
      .query('tribunePosts')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .order('desc')
      .take(MY_POSTS_MAX);
    return posts
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => ({
        _id: p._id,
        theme: p.theme,
        format: p.format,
        title: p.title,
        status: p.status,
        // The reason for a REJECTION is owed to the author; so is that of a withdrawal.
        rejectionReason: p.rejectionReason ?? null,
        parentPostId: p.parentPostId ?? null,
        libraryPublicationId: p.libraryPublicationId ?? null,
        commentCount: p.commentCount,
        createdAt: p.createdAt,
      }));
  },
});

// Preview of ONE of their posts, whatever its state — this is how
// the author rereads a pending or rejected text, which the public page does not
// serve. Any other account receives `null`.
export const getOwnPost = query({
  args: { postId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id('tribunePosts'),
      theme: v.string(),
      format: v.union(v.literal('court'), v.literal('fond')),
      title: v.string(),
      body: v.string(),
      status: contentStatusValidator,
      rejectionReason: v.union(v.string(), v.null()),
      parent: v.union(linkedPostValidator, v.null()),
      createdAt: v.number(),
      updatedAt: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await getActiveUserId(ctx);
    if (!userId) return null;
    const id = ctx.db.normalizeId('tribunePosts', args.postId);
    const post = id ? await ctx.db.get(id) : null;
    if (!post || post.authorUserId !== userId) return null;
    const parent = post.parentPostId
      ? await ctx.db.get(post.parentPostId)
      : null;
    return {
      _id: post._id,
      theme: post.theme,
      format: post.format,
      title: post.title,
      body: post.body,
      status: post.status,
      rejectionReason: post.rejectionReason ?? null,
      parent: parent ? linked(parent) : null,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt ?? null,
    };
  },
});

// My comments, with their state (useful in comment pre-moderation
// mode, and to read the reason for a rejection).
export const myComments = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('tribuneComments'),
      postId: v.id('tribunePosts'),
      postTitle: v.string(),
      excerpt: v.string(),
      status: contentStatusValidator,
      rejectionReason: v.union(v.string(), v.null()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getActiveUserId(ctx);
    if (!userId) return [];
    const comments = await ctx.db
      .query('tribuneComments')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .order('desc')
      .take(MY_POSTS_MAX);
    const out = [];
    for (const c of comments) {
      const post = await ctx.db.get(c.postId);
      if (!post) continue;
      out.push({
        _id: c._id,
        postId: c.postId,
        postTitle: post.title,
        excerpt: excerpt(c.body, 160),
        status: c.status,
        rejectionReason: c.rejectionReason ?? null,
        createdAt: c.createdAt,
      });
    }
    return out;
  },
});

// --- Deepening (F-48) -------------------------------------------------

// What the current user can do around a published post:
// deepen it (author or invitee), invite (author of a short post),
// propose it to the library (author of a long-form contribution). Anonymous:
// nothing, without error — the query is mounted on a public page.
export const deepeningState = query({
  args: { postId: v.id('tribunePosts') },
  returns: v.object({
    canDeepen: v.boolean(),
    isAuthor: v.boolean(),
    invites: v.array(
      v.object({ _id: v.id('tribuneDeepeningInvites'), email: v.string() }),
    ),
    canProposeToLibrary: v.boolean(),
    proposedToLibrary: v.boolean(),
  }),
  handler: async (ctx, { postId }) => {
    const none = {
      canDeepen: false,
      isAuthor: false,
      invites: [],
      canProposeToLibrary: false,
      proposedToLibrary: false,
    };
    const userId = await getActiveUserId(ctx);
    if (!userId) return none;
    const user = await ctx.db.get(userId);
    const post = await ctx.db.get(postId);
    if (!user || !post || post.status !== 'published') return none;
    if (roleRank(user.role) < roleRank('membre')) return none;
    const isAuthor = post.authorUserId === user._id;
    const invites = isAuthor
      ? (
          await ctx.db
            .query('tribuneDeepeningInvites')
            .withIndex('by_post', (q) => q.eq('postId', postId))
            .take(100)
        )
          .filter((i) => i.status === 'pending')
          .map((i) => ({ _id: i._id, email: i.email }))
      : [];
    return {
      canDeepen: isDeepenable(post) && (await canDeepen(ctx, post, user)),
      isAuthor,
      invites,
      canProposeToLibrary:
        isAuthor && post.format === 'fond' && !post.libraryPublicationId,
      proposedToLibrary: !!post.libraryPublicationId,
    };
  },
});

// The author of a short post invites a network member to extend it. Same
// rule as workspace invitations: designated by their address, identical response
// whether or not an account exists (no existence oracle).
export const inviteDeepening = mutation({
  args: { postId: v.id('tribunePosts'), email: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { postId, email: raw }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const post = await ctx.db.get(postId);
    if (!post || post.authorUserId !== user._id) {
      throw new ConvexError('NOT_FOUND');
    }
    if (!isDeepenable(post)) throw new ConvexError('NOT_DEEPENABLE');
    if (!isEmail(raw)) throw new ConvexError('INVALID_EMAIL');
    const email = normalizeEmail(raw);
    if (user.email && normalizeEmail(user.email) === email) {
      throw new ConvexError('INVALID_INVITEE');
    }
    await enforceRateLimit(ctx, {
      key: `deepeningInvite:${user._id}`,
      ...RATE_LIMITS.deepeningInvite,
    });
    const already = (
      await ctx.db
        .query('tribuneDeepeningInvites')
        .withIndex('by_post', (q) => q.eq('postId', postId))
        .take(100)
    ).find((i) => i.email === email && i.status === 'pending');
    if (already) return { ok: true };

    const invitee = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .first();
    const invitedUserId =
      invitee && roleRank(invitee.role) >= roleRank('membre')
        ? invitee._id
        : undefined;
    await ctx.db.insert('tribuneDeepeningInvites', {
      postId,
      email,
      ...(invitedUserId ? { invitedUserId } : {}),
      invitedBy: user._id,
      status: 'pending',
      createdAt: Date.now(),
    });
    if (invitedUserId) {
      await notify(ctx, {
        userId: invitedUserId,
        type: 'tribune_deepening_invite',
        titleKey: 'tribuneDeepeningInvite',
        params: { title: post.title, name: authorName(user) },
        link: `/tribune/${postId}`,
      });
    }
    return { ok: true };
  },
});

export const revokeDeepeningInvite = mutation({
  args: { inviteId: v.id('tribuneDeepeningInvites') },
  returns: v.null(),
  handler: async (ctx, { inviteId }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const invite = await ctx.db.get(inviteId);
    if (!invite || invite.invitedBy !== user._id) {
      throw new ConvexError('NOT_FOUND');
    }
    await ctx.db.patch(inviteId, { status: 'revoked' });
    return null;
  },
});

// Invitations to deepen received by the current user.
export const myDeepeningInvites = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('tribuneDeepeningInvites'),
      postId: v.id('tribunePosts'),
      postTitle: v.string(),
      authorName: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getActiveUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user) return [];
    const byUser = await ctx.db
      .query('tribuneDeepeningInvites')
      .withIndex('by_user', (q) => q.eq('invitedUserId', user._id))
      .take(100);
    const byEmail = user.email
      ? await ctx.db
          .query('tribuneDeepeningInvites')
          .withIndex('by_email', (q) =>
            q.eq('email', normalizeEmail(user.email!)),
          )
          .take(100)
      : [];
    const seen = new Set<string>();
    const out = [];
    for (const i of [...byUser, ...byEmail]) {
      if (seen.has(i._id) || i.status !== 'pending') continue;
      seen.add(i._id);
      const post = await ctx.db.get(i.postId);
      if (!isDeepenable(post) || !post) continue;
      out.push({
        _id: i._id,
        postId: post._id,
        postTitle: post.title,
        authorName: post.authorName,
        createdAt: i.createdAt,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Propose one's PUBLISHED long-form contribution to the library (F-48 → F-32).
//
// The existing model allows it simply: a publication is born `pending`,
// in the /admin/publications queue, where editorial moderation (and its
// AI pre-sort) decides as for any submission. Nothing is published here. The
// metadata the Tribune does not know takes the most neutral value
// — type `note`, region `mondial`, open access — and the moderator adjusts it.
export const proposeToLibrary = mutation({
  args: { postId: v.id('tribunePosts') },
  returns: v.id('publications'),
  handler: async (ctx, { postId }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const post = await ctx.db.get(postId);
    if (!post || post.authorUserId !== user._id) {
      throw new ConvexError('NOT_FOUND');
    }
    if (post.status !== 'published' || post.format !== 'fond') {
      throw new ConvexError('NOT_ELIGIBLE');
    }
    if (post.libraryPublicationId) throw new ConvexError('ALREADY_PROPOSED');
    await enforceRateLimit(ctx, {
      key: `pub:${user._id}`,
      ...RATE_LIMITS.publicationSubmit,
    });

    const paragraphs = post.body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    const abstract = excerpt(post.body, 600);

    const root = slugify(post.title);
    let slug = root;
    let n = 2;
    while (
      await ctx.db
        .query('publications')
        .withIndex('by_slug', (q) => q.eq('slug', slug))
        .first()
    ) {
      slug = `${root}-${n++}`;
    }
    const now = Date.now();
    const pubId = await ctx.db.insert('publications', {
      title: post.title,
      slug,
      type: 'note',
      theme: post.theme,
      region: 'mondial',
      languages: [post.lang ?? 'fr'],
      access: 'open',
      authors: [{ name: post.authorName }],
      year: new Date(now).getUTCFullYear(),
      publishedAt: 0,
      abstract,
      keypoints: [],
      body: paragraphs,
      doi: '',
      downloads: 0,
      citations: 0,
      views: 0,
      status: 'pending',
      authorUserId: user._id,
      submittedAt: now,
      createdAt: now,
    });
    await trackPublicationStatus(ctx, null, 'pending');
    await ctx.db.patch(post._id, { libraryPublicationId: pubId });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.PUBLICATION_SUBMITTED,
      targetId: pubId,
      metadata: { type: 'note', theme: post.theme, fromTribunePost: post._id },
    });
    // Same pre-sort as any library submission (convex/aiModeration.ts).
    const ai = await loadAiSettings(ctx);
    if (ai.mode !== 'off') {
      await ctx.scheduler.runAfter(0, internal.aiModeration.runReview, {
        publicationId: pubId,
      });
    }
    return pubId;
  },
});

// --- Back office: report queue (moderator and above) -----------
const REPORTS_QUEUE_MAX = 200;

export const listReports = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('tribuneReports'),
      targetType: v.union(v.literal('post'), v.literal('comment')),
      reason: v.union(v.string(), v.null()),
      excerpt: v.string(),
      // `normalizeId` may return nothing (deleted target): hence the null.
      postId: v.union(v.id('tribunePosts'), v.null()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'moderateur');
    // WORK queue: the index contains only UNRESOLVED reports,
    // and resolving removes the row from the queue. The cap therefore uncovers the rest
    // as processing proceeds, instead of growing an unbounded
    // read (issue #8).
    const reports = await ctx.db
      .query('tribuneReports')
      .withIndex('by_resolved', (q) => q.eq('resolved', false))
      .order('desc')
      .take(REPORTS_QUEUE_MAX);

    // N+1: the target was re-read report by report. Yet the normal case
    // is precisely that SEVERAL reports target the SAME content — ten
    // people report the same post. We therefore deduplicate the targets before
    // reading them, once each.
    //
    // `normalizeId` BEFORE any ctx.db.get: `targetId` is a
    // `v.string()` column, so a row written before the fix (or by a future
    // write path) may contain anything. A blind cast made the entire
    // query fail, locking the queue for all moderators
    // (audit M1). An unreadable target is simply displayed "(supprimé)" and
    // remains resolvable.
    const targetKey = (
      r: Pick<Doc<'tribuneReports'>, 'targetType' | 'targetId'>,
    ) => `${r.targetType}:${r.targetId}`;

    const uniqueTargets = new Map(
      reports.map((r) => [
        targetKey(r),
        { targetType: r.targetType, targetId: r.targetId },
      ]),
    );
    const targets = new Map<
      string,
      { excerpt: string; postId: Id<'tribunePosts'> | null }
    >();
    await Promise.all(
      [...uniqueTargets].map(async ([key, { targetType, targetId }]) => {
        if (targetType === 'post') {
          const id = ctx.db.normalizeId('tribunePosts', targetId);
          const p = id ? await ctx.db.get(id) : null;
          if (p) targets.set(key, { excerpt: p.title, postId: p._id });
        } else {
          const id = ctx.db.normalizeId('tribuneComments', targetId);
          const c = id ? await ctx.db.get(id) : null;
          if (c) {
            targets.set(key, {
              excerpt:
                c.body.length > 140 ? `${c.body.slice(0, 140)}…` : c.body,
              postId: c.postId,
            });
          }
        }
      }),
    );

    return reports.map((r) => {
      const target = targets.get(targetKey(r));
      return {
        _id: r._id,
        targetType: r.targetType,
        reason: r.reason ?? null,
        excerpt: target?.excerpt ?? '(supprimé)',
        postId: target?.postId ?? null,
        createdAt: r.createdAt,
      };
    });
  },
});

export const resolveReport = mutation({
  args: {
    reportId: v.id('tribuneReports'),
    action: v.union(v.literal('dismiss'), v.literal('remove')),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { reportId, action }) => {
    const mod = await requireNetworkRole(ctx, 'moderateur');
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error('NOT_FOUND');

    let postId: Id<'tribunePosts'> | undefined;
    if (action === 'remove') {
      // Same precaution as in `listReports`: the target is normalized before
      // any read. Without it, a report with an unreadable target could
      // not even be PROCESSED ("retirer" threw), and therefore stayed
      // indefinitely in the queue (audit M1).
      if (report.targetType === 'post') {
        const id = ctx.db.normalizeId('tribunePosts', report.targetId);
        const p = id ? await ctx.db.get(id) : null;
        if (p) {
          postId = p._id;
          if (p.status !== 'removed') {
            await ctx.db.patch(p._id, {
              status: 'removed',
              moderatedBy: mod._id,
              moderatedAt: Date.now(),
            });
            await trackTribunePostStatus(ctx, p.status, 'removed');
            await logModerationEvent(ctx, {
              targetType: 'post',
              targetId: p._id,
              postId: p._id,
              kind: 'removed',
              actorId: mod._id,
              statusFrom: p.status,
              statusTo: 'removed',
            });
          }
        }
      } else {
        const id = ctx.db.normalizeId('tribuneComments', report.targetId);
        const c = id ? await ctx.db.get(id) : null;
        if (c) {
          postId = c.postId;
          if (c.status !== 'removed') {
            await ctx.db.patch(c._id, {
              status: 'removed',
              moderatedBy: mod._id,
              moderatedAt: Date.now(),
            });
            await trackTribuneCommentStatus(ctx, c.status, 'removed');
            const post = await ctx.db.get(c.postId);
            if (c.status === 'published' && post && post.commentCount > 0) {
              await ctx.db.patch(post._id, {
                commentCount: post.commentCount - 1,
              });
            }
            await logModerationEvent(ctx, {
              targetType: 'comment',
              targetId: c._id,
              postId: c.postId,
              kind: 'removed',
              actorId: mod._id,
              statusFrom: c.status,
              statusTo: 'removed',
            });
          }
        }
      }
    } else {
      await logModerationEvent(ctx, {
        targetType: report.targetType,
        targetId: report.targetId,
        kind: 'reports_dismissed',
        actorId: mod._id,
      });
    }

    await ctx.db.patch(reportId, { resolved: true });
    await recordAudit(ctx, {
      actorId: mod._id,
      action: AUDIT.TRIBUNE_MODERATED,
      targetId: reportId,
      metadata: { action, targetType: report.targetType, postId },
    });
    return { ok: true };
  },
});

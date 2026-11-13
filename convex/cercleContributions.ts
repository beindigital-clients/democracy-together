import { ConvexError, v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { mutation, query } from './_generated/server';
import { requireCercleAccess } from './lib/rbac';
import { roleRank } from './lib/roles';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { clampPageSize, paginatedValidator } from './lib/pagination';
import { validateContributionBody } from './lib/cercle';

// PRIVATE CONTRIBUTIONS OF THE CERCLE (feature 3).
//
// Free text written by an Ami or a member, read by the Cercle only. Every
// function goes through `requireCercleAccess`: the filter is the server's, the
// interface only mirrors it. This space is separate from the public KOHOP
// contributions on purpose — no shared table, no shared query, nothing that
// could list one in the other.
//
// NOT sent to the AI moderation provider: that analysis sends text to a third
// party, and the Cercle's contributions are private. Nothing here schedules
// `aiModeration.runReview`; a test pins it (cercle-leaks.test.ts).

const contributionValidator = v.object({
  _id: v.id('cercleContributions'),
  body: v.string(),
  createdAt: v.number(),
  // The author's display name when they set one, never their address.
  authorName: v.union(v.string(), v.null()),
  mine: v.boolean(),
});

export const submit = mutation({
  args: { body: v.string() },
  returns: v.id('cercleContributions'),
  handler: async (ctx, args) => {
    const user = await requireCercleAccess(ctx, 'write');
    const checked = validateContributionBody(args.body);
    if (!checked.ok) throw new ConvexError(checked.code);
    await enforceRateLimit(ctx, {
      key: `cercle-contribution:${user._id}`,
      ...RATE_LIMITS.cercleContribution,
    });
    return await ctx.db.insert('cercleContributions', {
      authorUserId: user._id,
      body: checked.body,
      createdAt: Date.now(),
      status: 'visible',
    });
  },
});

/** Everything the Cercle has written, newest first. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginatedValidator(contributionValidator),
  handler: async (ctx, { paginationOpts }) => {
    const viewer = await requireCercleAccess(ctx);
    const result = await ctx.db
      .query('cercleContributions')
      .withIndex('by_status_and_createdAt', (q) => q.eq('status', 'visible'))
      .order('desc')
      .paginate(clampPageSize(paginationOpts));
    const names = new Map<string, string | null>();
    const page = [];
    for (const c of result.page) {
      if (!names.has(c.authorUserId)) {
        const author = await ctx.db.get(c.authorUserId);
        names.set(c.authorUserId, author?.name?.trim() || null);
      }
      page.push({
        _id: c._id,
        body: c.body,
        createdAt: c.createdAt,
        authorName: names.get(c.authorUserId) ?? null,
        mine: c.authorUserId === viewer._id,
      });
    }
    return { ...result, page };
  },
});

/**
 * Takes a contribution down: its author, or staff (moderator and above) for
 * any. The text is erased, a tombstone stays so the audit trail has a target.
 */
export const remove = mutation({
  args: { contributionId: v.id('cercleContributions') },
  returns: v.null(),
  handler: async (ctx, { contributionId }) => {
    const user = await requireCercleAccess(ctx, 'write');
    const row = await ctx.db.get(contributionId);
    if (!row || row.status === 'removed') throw new ConvexError('NOT_FOUND');
    const own = row.authorUserId === user._id;
    if (!own && roleRank(user.role) < roleRank('moderateur')) {
      throw new ConvexError('CERCLE_ACCESS_REQUIRED');
    }
    await ctx.db.patch(contributionId, {
      status: 'removed',
      body: '',
      removedAt: Date.now(),
      removedBy: user._id,
    });
    if (!own) {
      await recordAudit(ctx, {
        actorId: user._id,
        action: AUDIT.CERCLE_CONTRIBUTION_REMOVED,
        targetId: contributionId,
      });
    }
    return null;
  },
});

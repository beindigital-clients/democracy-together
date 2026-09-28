import { v, ConvexError } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { requireNetworkRole } from './lib/rbac';
import { FIELD_MAX } from './lib/validation';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { assertTransition, type ReviewMachine } from './lib/reviewState';
import { isNetworkTheme } from './lib/themes';

// Collaborative calls for projects (F-60). The public page presents the
// scheme; a member proposes a project (status 'pending'), the staff reviews it
// (accepted / rejected). `theme` = one of the network's 5 axes (mirrors PUB_THEMES,
// src/lib/publications.ts — keep in sync).

function authorName(user: Doc<'users'>): string {
  return user.name?.trim() || 'Membre';
}

// --- Proposal (member and above) --------------------------------------------
export const submitProject = mutation({
  args: {
    theme: v.string(),
    title: v.string(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const theme = args.theme.trim();
    const title = args.title.trim();
    const summary = args.summary.trim();
    if (!isNetworkTheme(theme)) throw new Error('INVALID_THEME');
    if (title.length < 4 || title.length > 160)
      throw new Error('INVALID_TITLE');
    // Bound shared with the form; `ConvexError` so that a 4,001-character
    // abstract gets "4 000 maximum" and not "Envoi impossible"
    // (A-04).
    if (summary.length < 20 || summary.length > FIELD_MAX.body) {
      throw new ConvexError('INVALID_SUMMARY');
    }

    await enforceRateLimit(ctx, {
      key: `projectSubmit:${user._id}`,
      ...RATE_LIMITS.projectSubmit,
    });

    await ctx.db.insert('projectProposals', {
      authorUserId: user._id,
      authorName: authorName(user),
      theme,
      title,
      summary,
      status: 'pending',
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

// --- Back-office (moderator and above) --------------------------------------
export const listProjectProposals = query({
  // CLOSED domain (mirrors the schema): the back-office only offers these
  // values, the validator enforces them. No filter -> the whole queue.
  args: {
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('accepted'),
        v.literal('rejected'),
      ),
    ),
  },
  handler: async (ctx, { status }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const all = status
      ? await ctx.db
          .query('projectProposals')
          .withIndex('by_status', (q) => q.eq('status', status))
          .collect()
      : await ctx.db.query('projectProposals').collect();
    return all
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => ({
        _id: p._id,
        authorName: p.authorName,
        theme: p.theme,
        title: p.title,
        summary: p.summary,
        status: p.status,
        reviewNotes: p.reviewNotes ?? null,
        createdAt: p.createdAt,
      }));
  },
});

// --- State machine for reviewing proposals (issue #9) ----------------------
//
//   pending ──accepted/rejected──► accepted | rejected
//   accepted | rejected ──reopenProjectProposal──► pending
//
// Side effect of the decision: NONE today (accepting opens no
// workspace and grants no right; the follow-up happens outside
// the tool). If an acceptance ever creates something, the reversal
// will have to undo it — all the more reason why it must not happen through a
// second click. Meanwhile, the guard protects the audit log: a
// proposal cannot appear there accepted then rejected without knowing
// which of the two rows is authoritative.
const PROJECT_REVIEW: ReviewMachine<Doc<'projectProposals'>['status']> = {
  transitions: {
    pending: ['accepted', 'rejected'],
    accepted: ['pending'],
    rejected: ['pending'],
  },
  decided: ['accepted', 'rejected'],
};

export const reviewProjectProposal = mutation({
  args: {
    proposalId: v.id('projectProposals'),
    decision: v.union(v.literal('accepted'), v.literal('rejected')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { proposalId, decision, notes }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const proposal = await ctx.db.get(proposalId);
    if (!proposal) throw new Error('NOT_FOUND');
    assertTransition(proposal.status, decision, PROJECT_REVIEW);

    await ctx.db.patch(proposalId, {
      status: decision,
      reviewedBy: reviewer._id,
      reviewNotes: notes?.trim() || undefined,
      reviewedAt: Date.now(),
    });
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.PROJECT_REVIEWED,
      targetId: proposalId,
      metadata: { decision },
    });
    return { ok: true };
  },
});

// Reopening a decided proposal (issue #9) — moderator and above,
// audited under its own action (`project.reopened`). A decision made by
// mistake is corrected this way: the proposal goes back into the queue, and the
// rollback shows in the log instead of being confused there with a second
// review.
export const reopenProjectProposal = mutation({
  args: { proposalId: v.id('projectProposals') },
  handler: async (ctx, { proposalId }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const proposal = await ctx.db.get(proposalId);
    if (!proposal) throw new Error('NOT_FOUND');
    const from = proposal.status;
    assertTransition(from, 'pending', PROJECT_REVIEW);

    await ctx.db.patch(proposalId, { status: 'pending' });
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.PROJECT_REOPENED,
      targetId: proposalId,
      metadata: { from },
    });
    return { ok: true };
  },
});

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { requireNetworkRole } from './lib/rbac';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';

// Appels à projets collaboratifs (F-60). La page publique présente le
// dispositif ; un membre propose un projet (status 'pending'), le staff le revoit
// (accepted / rejected). `theme` = un des 5 axes du réseau (miroir de PUB_THEMES,
// src/lib/publications.ts — garder synchrone).
const THEMES = [
  'gouvernance-numerique',
  'participation',
  'anti-corruption',
  'transitions',
  'crises',
];

function authorName(user: Doc<'users'>): string {
  return user.name?.trim() || 'Membre';
}

// --- Proposition (membre et au-dessus) --------------------------------------
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
    if (!THEMES.includes(theme)) throw new Error('INVALID_THEME');
    if (title.length < 4 || title.length > 160) throw new Error('INVALID_TITLE');
    if (summary.length < 20 || summary.length > 4000) {
      throw new Error('INVALID_SUMMARY');
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

// --- Back-office (modérateur et au-dessus) ----------------------------------
export const listProjectProposals = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const all =
      status === 'pending' || status === 'accepted' || status === 'rejected'
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

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { requireNetworkRole } from './lib/rbac';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { assertTransition, type ReviewMachine } from './lib/reviewState';
import { isNetworkTheme } from './lib/themes';

// Appels à projets collaboratifs (F-60). La page publique présente le
// dispositif ; un membre propose un projet (status 'pending'), le staff le revoit
// (accepted / rejected). `theme` = un des 5 axes du réseau (miroir de PUB_THEMES,
// src/lib/publications.ts — garder synchrone).

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
    if (!isNetworkTheme(theme)) throw new Error('INVALID_THEME');
    if (title.length < 4 || title.length > 160)
      throw new Error('INVALID_TITLE');
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
  // Domaine FERMÉ (miroir du schéma) : le back-office ne propose que ces
  // valeurs, le validateur les impose. Sans filtre -> toute la file.
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

// --- Machine à états de la revue des propositions (issue #9) ---------------
//
//   pending ──accepted/rejected──► accepted | rejected
//   accepted | rejected ──reopenProjectProposal──► pending
//
// Effet de bord de la décision : AUCUN aujourd'hui (accepter n'ouvre pas
// d'espace de travail et n'accorde aucun droit ; la suite se traite hors de
// l'outil). Si une acceptation en vient à créer quelque chose, l'inversion
// devra le défaire — raison de plus pour qu'elle ne puisse pas arriver par un
// second clic. En attendant, la garde protège le journal d'audit : une
// proposition ne peut pas y apparaître acceptée puis rejetée sans qu'on sache
// laquelle des deux lignes fait foi.
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

// Réouverture d'une proposition tranchée (issue #9) — modérateur et au-dessus,
// audité sous sa propre action (`project.reopened`). Une décision prise par
// erreur se corrige ainsi : la proposition retourne dans la file, et le retour
// en arrière se lit dans le journal au lieu de s'y confondre avec une seconde
// revue.
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

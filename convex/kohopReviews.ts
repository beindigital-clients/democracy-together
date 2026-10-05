import { v, ConvexError } from 'convex/values';
import { query, mutation } from './_generated/server';
import { requireNetworkRole } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import {
  KOHOP_BOUNDS,
  KOHOP_DELAYS_MS,
  KOHOP_REVIEWER_CONSENT_VERSION,
  kohopRecommendation,
} from './lib/kohop';
import { validateBody } from './lib/kohopText';
import {
  recordKohopEvent,
  requireOwnAssignment,
  versionOf,
} from './lib/kohopAccess';
import { completeReviewIfReady, replaceTitular } from './lib/kohopReviewing';

// KOHOP — the REVIEWER's side. Every function goes through
// `requireOwnAssignment`: someone else's assignment, or a designation not yet
// turned into an invitation, does not exist for the caller. The text is read
// only after the reviewer accepted (confidentiality: a reviewer who declines
// never saw it) and the analysis can be edited only while the review is open.

function refuse(code: string): never {
  throw new ConvexError(code);
}

const SUGGESTED_NAME_MAX = 120;
const NOTE_MAX = 1000;

// --- Reading ------------------------------------------------------------------

/** My invitations and analyses, most recent first. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const rows = await ctx.db
      .query('kohopReviewers')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(50);
    const items = [];
    for (const r of rows) {
      if (r.status === 'proposed' || r.status === 'approved') continue;
      if (r.status === 'recused') continue;
      const file = await ctx.db.get(r.contributionId);
      if (!file) continue;
      items.push({
        _id: r._id,
        title: file.title,
        status: r.status,
        stage: file.stage,
        invitedAt: r.invitedAt ?? null,
        dueAt: r.dueAt ?? null,
      });
    }
    return items;
  },
});

/** One assignment. `null` when it is not mine (never an error page). */
export const assignment = query({
  args: { reviewerId: v.id('kohopReviewers') },
  handler: async (ctx, { reviewerId }) => {
    let found;
    try {
      found = await requireOwnAssignment(ctx, reviewerId);
    } catch (err) {
      if (err instanceof ConvexError && err.data === 'NOT_FOUND') return null;
      throw err;
    }
    const { reviewer, contribution: file } = found;
    const versionNumber = file.reviewedVersion ?? file.submittedVersion;
    const version =
      versionNumber !== undefined
        ? await versionOf(ctx, file._id, versionNumber)
        : null;
    const author = await ctx.db.get(file.authorUserId);
    const org = file.organizationId
      ? await ctx.db.get(file.organizationId)
      : null;
    const canRead =
      reviewer.status === 'accepted' || reviewer.status === 'submitted';
    const review =
      reviewer.status === 'submitted'
        ? await ctx.db
            .query('kohopReviews')
            .withIndex('by_reviewer', (q) => q.eq('reviewerId', reviewer._id))
            .unique()
        : null;
    return {
      reviewer: {
        _id: reviewer._id,
        status: reviewer.status,
        dueAt: reviewer.dueAt ?? null,
        consentAt: reviewer.publicationConsentAt ?? null,
      },
      stage: file.stage,
      contribution: {
        title: version?.title ?? file.title,
        standfirst: version?.standfirst ?? '',
        lang: file.lang,
        fields: file.fields,
        words: version?.wordCount ?? 0,
        authorName: author?.name?.trim() || null,
        organization: org?.name ?? null,
      },
      // The text itself: only once the invitation is accepted.
      body: canRead ? (version?.body ?? '') : null,
      links: canRead ? (version?.links ?? []) : [],
      review: review
        ? {
            recommendation: review.recommendation,
            analysis: review.analysis,
            noteToEditor: review.noteToEditor ?? '',
            submittedAt: review.submittedAt,
            // Editable until the review is complete.
            editable: file.stage === 'in_review',
          }
        : null,
    };
  },
});

// --- Answering the invitation ---------------------------------------------------

export const respond = mutation({
  args: {
    reviewerId: v.id('kohopReviewers'),
    accept: v.boolean(),
    // Declared at acceptance: no conflict of interest.
    hasConflict: v.boolean(),
    conflictDetails: v.optional(v.string()),
    // The analysis will be published under the reviewer's name.
    consent: v.optional(v.boolean()),
    // On a refusal: who the reviewer suggests instead (optional).
    suggestedName: v.optional(v.string()),
    suggestedEmail: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const {
      user,
      reviewer,
      contribution: file,
    } = await requireOwnAssignment(ctx, args.reviewerId);
    if (reviewer.status !== 'invited' || file.stage !== 'in_review') {
      refuse('INVALID_TRANSITION');
    }
    const now = Date.now();
    if (reviewer.dueAt !== undefined && now > reviewer.dueAt) {
      refuse('INVITATION_EXPIRED');
    }
    const note = args.note?.trim() || undefined;
    const details = args.conflictDetails?.trim() || undefined;
    const suggestedName = args.suggestedName?.trim() || undefined;
    const suggestedEmail =
      args.suggestedEmail?.trim().toLowerCase() || undefined;
    if (
      (note && note.length > NOTE_MAX) ||
      (details && details.length > NOTE_MAX) ||
      (suggestedName && suggestedName.length > SUGGESTED_NAME_MAX) ||
      (suggestedEmail && !/^\S+@\S+\.\S+$/.test(suggestedEmail))
    ) {
      refuse('INVALID_NOTE');
    }

    if (args.accept) {
      // Accepting is conditioned on the two declarations.
      if (args.hasConflict) refuse('CONFLICT_DECLARED');
      if (args.consent !== true) refuse('CONSENT_REQUIRED');
      await ctx.db.patch(reviewer._id, {
        status: 'accepted',
        respondedAt: now,
        dueAt: now + KOHOP_DELAYS_MS.analysis,
        remindersSent: 0,
        conflict: { hasConflict: false, declaredAt: now },
        publicationConsentAt: now,
        publicationConsentVersion: KOHOP_REVIEWER_CONSENT_VERSION,
        updatedAt: now,
      });
      await recordKohopEvent(ctx, {
        contributionId: file._id,
        kind: 'reviewer_accepted',
        actorId: user._id,
        metadata: { reviewerId: reviewer._id },
      });
      await recordAudit(ctx, {
        actorId: user._id,
        action: AUDIT.KOHOP_REVIEWER_ACCEPTED,
        targetId: file._id,
        metadata: { reviewerId: reviewer._id },
      });
      return null;
    }

    await ctx.db.patch(reviewer._id, {
      status: 'declined',
      respondedAt: now,
      dueAt: undefined,
      conflict: args.hasConflict
        ? { hasConflict: true, details, declaredAt: now }
        : undefined,
      suggestedInstead: suggestedName
        ? { name: suggestedName, email: suggestedEmail, note }
        : undefined,
      updatedAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: file._id,
      kind: 'reviewer_declined',
      actorId: user._id,
      metadata: { reviewerId: reviewer._id, conflict: args.hasConflict },
    });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.KOHOP_REVIEWER_DECLINED,
      targetId: file._id,
      metadata: { reviewerId: reviewer._id },
    });
    if (reviewer.slot === 'titular') {
      await replaceTitular(ctx, file, reviewer);
    }
    return null;
  },
});

// --- The analysis ---------------------------------------------------------------

export const saveReview = mutation({
  args: {
    reviewerId: v.id('kohopReviewers'),
    recommendation: kohopRecommendation,
    analysis: v.string(),
    noteToEditor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const {
      user,
      reviewer,
      contribution: file,
    } = await requireOwnAssignment(ctx, args.reviewerId);
    // First hand-in (accepted), or an edit while the review is still open.
    if (
      (reviewer.status !== 'accepted' && reviewer.status !== 'submitted') ||
      file.stage !== 'in_review'
    ) {
      refuse('INVALID_TRANSITION');
    }
    const problem = validateBody(args.analysis, KOHOP_BOUNDS.analysisWords);
    if (problem) {
      refuse(
        problem.code === 'unsupported'
          ? 'ANALYSIS_UNSUPPORTED'
          : problem.code === 'too_short'
            ? 'ANALYSIS_TOO_SHORT'
            : 'ANALYSIS_TOO_LONG',
      );
    }
    const note = args.noteToEditor?.trim() || undefined;
    if (note && note.length > KOHOP_BOUNDS.noteToEditor.max) {
      refuse('INVALID_NOTE');
    }
    const now = Date.now();
    const analysis = args.analysis.trim();
    const existing = await ctx.db
      .query('kohopReviews')
      .withIndex('by_reviewer', (q) => q.eq('reviewerId', reviewer._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        recommendation: args.recommendation,
        analysis,
        noteToEditor: note,
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.insert('kohopReviews', {
      contributionId: file._id,
      reviewerId: reviewer._id,
      version: file.reviewedVersion ?? file.submittedVersion ?? 1,
      recommendation: args.recommendation,
      analysis,
      noteToEditor: note,
      // Frozen: this is the name and affiliation that will be published.
      displayName: reviewer.name,
      affiliation: reviewer.affiliation,
      submittedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(reviewer._id, {
      status: 'submitted',
      dueAt: undefined,
      updatedAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: file._id,
      kind: 'review_submitted',
      actorId: user._id,
      metadata: { reviewerId: reviewer._id },
    });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.KOHOP_REVIEW_SUBMITTED,
      targetId: file._id,
      metadata: { reviewerId: reviewer._id },
    });
    await completeReviewIfReady(ctx, file);
    return null;
  },
});

import type { MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import { recordAudit } from './audit';
import { AUDIT } from './auditActions';
import { notify } from './notify';
import { reviewChiefRecipients } from './reviewChiefs';
import { KOHOP_DELAYS_MS, nextStage } from './kohop';
import { recordKohopEvent } from './kohopAccess';
import type { KohopAuthorEmailKind } from './kohopEmails';

// KOHOP — the reviewers' life cycle, shared by the review chief's functions,
// the reviewers' own and the deadline cron. Every function runs INSIDE the
// caller's transaction and assumes the caller already went through the state
// machine and the guards.

/** An e-mail to the author about a milestone, from a scheduled action. */
export async function scheduleAuthorEmail(
  ctx: MutationCtx,
  contributionId: Id<'kohopContributions'>,
  kind: KohopAuthorEmailKind,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.kohopEmail.sendAuthorEmail, {
    contributionId,
    kind,
  });
}

/** Sends the invitation: status, deadline, notification, e-mail, history. */
export async function inviteReviewer(
  ctx: MutationCtx,
  file: Doc<'kohopContributions'>,
  reviewer: Doc<'kohopReviewers'>,
  actorId?: Id<'users'>,
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch(reviewer._id, {
    status: 'invited',
    invitedAt: now,
    dueAt: now + KOHOP_DELAYS_MS.invitationReply,
    remindersSent: 0,
    updatedAt: now,
  });
  await recordKohopEvent(ctx, {
    contributionId: file._id,
    kind: 'reviewer_invited',
    actorId,
    metadata: { reviewerId: reviewer._id },
  });
  await recordAudit(ctx, {
    actorId,
    action: AUDIT.KOHOP_REVIEWER_INVITED,
    targetId: file._id,
    metadata: { reviewerId: reviewer._id },
  });
  if (reviewer.source === 'external' && !reviewer.userId) {
    // No account yet: the invitation goes by e-mail with a one-time token,
    // drawn in the action (never in a scheduled function's arguments).
    await ctx.scheduler.runAfter(0, internal.kohopExternal.sendInvitation, {
      reviewerId: reviewer._id,
      kind: 'invitation',
    });
  } else if (reviewer.userId) {
    await notify(ctx, {
      userId: reviewer.userId,
      type: 'kohop_review_invitation',
      titleKey: 'kohopReviewInvitation',
      params: { title: file.title },
      link: `/espace-membre/relectures/${reviewer._id}`,
    });
    await ctx.scheduler.runAfter(0, internal.kohopEmail.sendReviewerEmail, {
      reviewerId: reviewer._id,
      kind: 'invitation',
    });
  }
}

/**
 * A titular is gone (declined, expired, rejected): the approved substitute
 * takes the place and is invited at once. Without one, the review chiefs are
 * told that a reviewer is missing — the file waits, nothing is decided.
 */
export async function replaceTitular(
  ctx: MutationCtx,
  file: Doc<'kohopContributions'>,
  gone: Doc<'kohopReviewers'>,
): Promise<'promoted' | 'missing'> {
  const reviewers = await ctx.db
    .query('kohopReviewers')
    .withIndex('by_contribution', (q) => q.eq('contributionId', file._id))
    .take(30);
  const substitute = reviewers.find(
    (r) =>
      r.slot === 'substitute' &&
      r.status === 'approved' &&
      (r.userId || r.source === 'external'),
  );
  if (substitute) {
    await ctx.db.patch(substitute._id, { slot: 'titular' });
    await inviteReviewer(ctx, file, { ...substitute, slot: 'titular' });
    await recordAudit(ctx, {
      action: AUDIT.KOHOP_REVIEWER_REPLACED,
      targetId: file._id,
      metadata: { replaced: gone._id, by: substitute._id },
    });
    return 'promoted';
  }
  for (const chief of await reviewChiefRecipients(ctx)) {
    await notify(ctx, {
      userId: chief._id,
      type: 'kohop_reviewer_needed',
      titleKey: 'kohopReviewerNeeded',
      params: { title: file.title },
      link: `/admin/kohop/${file._id}`,
    });
  }
  await notify(ctx, {
    userId: file.authorUserId,
    type: 'kohop_reviewer_replaced',
    titleKey: 'kohopReviewerReplaced',
    params: { title: file.title },
    link: `/espace-membre/kohop/${file._id}`,
  });
  return 'missing';
}

/**
 * Two analyses in: the review is complete, the file moves to the revision
 * stage and the author is told. A no-op while fewer than two titulars handed
 * theirs in, or when the file is not in review any more.
 */
export async function completeReviewIfReady(
  ctx: MutationCtx,
  file: Doc<'kohopContributions'>,
): Promise<boolean> {
  if (file.stage !== 'in_review') return false;
  const reviewers = await ctx.db
    .query('kohopReviewers')
    .withIndex('by_contribution', (q) => q.eq('contributionId', file._id))
    .take(30);
  const submitted = reviewers.filter((r) => r.status === 'submitted').length;
  if (submitted < 2) return false;
  const now = Date.now();
  await ctx.db.patch(file._id, {
    stage: nextStage(file.stage, 'reviewsComplete'),
    revisionDueAt: now + KOHOP_DELAYS_MS.revision,
    updatedAt: now,
  });
  await recordKohopEvent(ctx, {
    contributionId: file._id,
    kind: 'reviewsComplete',
  });
  await notify(ctx, {
    userId: file.authorUserId,
    type: 'kohop_reviews_ready',
    titleKey: 'kohopReviewsReady',
    params: { title: file.title },
    link: `/espace-membre/kohop/${file._id}`,
  });
  await scheduleAuthorEmail(ctx, file._id, 'reviewsReady');
  return true;
}

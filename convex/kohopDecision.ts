import { v, ConvexError } from 'convex/values';
import { mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireReviewChief } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { slugify } from './lib/slug';
import { assertRefusal, kohopReasonCode, positiveCount } from './lib/kohop';
import { advance, recordKohopEvent } from './lib/kohopAccess';
import { scheduleAuthorEmail } from './lib/kohopReviewing';
import { originalityGate } from './kohopOriginality';

// KOHOP — THE DECISION (K-16). Only a review chief (or an administrator)
// decides; the analyses inform, they do not decide. Nothing here publishes: an
// accepted file goes to production, and publication is a separate, human act
// (batch 6). The AI never takes part in this decision.

function refuse(code: string): never {
  throw new ConvexError(code);
}

// Addresses under `/kohop/` that are not a contribution.
const RESERVED_SLUGS = ['invitation'];

async function uniqueSlug(ctx: MutationCtx, title: string): Promise<string> {
  const base = slugify(title);
  for (let n = 1; n < 50; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (RESERVED_SLUGS.includes(candidate)) continue;
    const taken = await ctx.db
      .query('kohopContributions')
      .withIndex('by_slug', (q) => q.eq('slug', candidate))
      .first();
    if (!taken) return candidate;
  }
  refuse('SLUG_UNAVAILABLE');
}

async function reviewsOf(ctx: MutationCtx, id: Id<'kohopContributions'>) {
  return await ctx.db
    .query('kohopReviews')
    .withIndex('by_contribution', (q) => q.eq('contributionId', id))
    .take(10);
}

/** Accepts the contribution: it goes to production, never straight to the public. */
export const accept = mutation({
  args: {
    contributionId: v.id('kohopContributions'),
    // Free note kept with the decision (optional on an acceptance).
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { contributionId, note }) => {
    const chief = await requireReviewChief(ctx);
    const file = await ctx.db.get(contributionId);
    if (!file) refuse('NOT_FOUND');
    const to = advance(file.stage, 'accept');
    // Originality: a finished platform report, and an external report that is
    // finished or explicitly acknowledged — the machine decides nothing alone.
    const gate = await originalityGate(ctx, file);
    if (!gate.ok) refuse('ORIGINALITY_REQUIRED');
    const reviews = await reviewsOf(ctx, contributionId);
    const text = note?.trim() ?? '';
    if (text.length > 4000) refuse('REASON_REQUIRED');

    const now = Date.now();
    // What the chief accepts: the revision handed in, or the reviewed text when
    // the author let the deadline pass.
    const version = Math.max(
      file.reviewedVersion ?? 0,
      file.submittedVersion ?? 0,
    );
    const slug = file.slug ?? (await uniqueSlug(ctx, file.title));
    await ctx.db.patch(file._id, {
      stage: to,
      acceptedVersion: version,
      slug,
      decidedAt: now,
      handlingEditorId: file.handlingEditorId ?? chief._id,
      updatedAt: now,
    });
    await ctx.db.insert('kohopDecisions', {
      contributionId: file._id,
      version,
      kind: 'accepted',
      reason: text,
      positiveReviews: positiveCount(reviews),
      againstPresumption: false,
      withoutExternalCheck: gate.withoutExternalCheck,
      decidedBy: chief._id,
      createdAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: file._id,
      kind: 'accept',
      actorId: chief._id,
      metadata: { version },
    });
    await recordAudit(ctx, {
      actorId: chief._id,
      action: AUDIT.KOHOP_ACCEPTED,
      targetId: file._id,
      metadata: { version },
    });
    if (gate.withoutExternalCheck) {
      await recordAudit(ctx, {
        actorId: chief._id,
        action: AUDIT.KOHOP_ACCEPTED_WITHOUT_EXTERNAL_CHECK,
        targetId: file._id,
        metadata: { version },
      });
    }
    await notify(ctx, {
      userId: file.authorUserId,
      type: 'kohop_accepted',
      titleKey: 'kohopAccepted',
      params: { title: file.title },
      link: `/espace-membre/kohop/${file._id}`,
    });
    await scheduleAuthorEmail(ctx, file._id, 'accepted');
    return null;
  },
});

/**
 * Refuses the contribution. With two positive opinions (the presumption of
 * acceptance) the reason must be an outrance, an infringement of the charter or
 * plagiarism; otherwise any code, with a written reason. The author always
 * receives the reason.
 */
export const refuseContribution = mutation({
  args: {
    contributionId: v.id('kohopContributions'),
    code: kohopReasonCode,
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { contributionId, code, reason }) => {
    const chief = await requireReviewChief(ctx);
    const file = await ctx.db.get(contributionId);
    if (!file) refuse('NOT_FOUND');
    const to = advance(file.stage, 'refuse');
    const reviews = await reviewsOf(ctx, contributionId);
    let against = false;
    try {
      against = assertRefusal({ code, reason, reviews }).againstPresumption;
    } catch (err) {
      refuse(err instanceof Error ? err.message : 'REASON_REQUIRED');
    }
    const text = reason.trim();
    if (text.length > 4000) refuse('REASON_REQUIRED');

    const now = Date.now();
    const version = Math.max(
      file.reviewedVersion ?? 0,
      file.submittedVersion ?? 0,
    );
    await ctx.db.patch(file._id, { stage: to, decidedAt: now, updatedAt: now });
    await ctx.db.insert('kohopDecisions', {
      contributionId: file._id,
      version,
      kind: 'refused',
      reasonCode: code,
      reason: text,
      positiveReviews: positiveCount(reviews),
      againstPresumption: against,
      decidedBy: chief._id,
      createdAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: file._id,
      kind: 'refuse',
      actorId: chief._id,
      metadata: { code, againstPresumption: against },
    });
    await recordAudit(ctx, {
      actorId: chief._id,
      action: against
        ? AUDIT.KOHOP_REFUSED_AGAINST_PRESUMPTION
        : AUDIT.KOHOP_REFUSED,
      targetId: file._id,
      metadata: { code },
    });
    await notify(ctx, {
      userId: file.authorUserId,
      type: 'kohop_refused',
      titleKey: 'kohopRefused',
      params: { title: file.title },
      link: `/espace-membre/kohop/${file._id}`,
    });
    await scheduleAuthorEmail(ctx, file._id, 'refused');
    return null;
  },
});

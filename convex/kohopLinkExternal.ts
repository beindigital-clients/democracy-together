import { v } from 'convex/values';
import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import { internal } from './_generated/api';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { levelOf } from './lib/kohop';
import { recordKohopEvent } from './lib/kohopAccess';
import {
  coSignRequestUrl,
  orcidOf,
  readCoSigned,
} from './lib/kohopExternalLinks';

// KOHOP — links found outside the platform (OpenAlex, through ORCID iDs). The
// check is scheduled when an author designates a reviewer; its findings are
// FLAGGED at most and read by the review chief only. The AI is not involved:
// an open scientific database answers, a rule reads the answer.

const TIMEOUT_MS = 8000;

export const context = internalQuery({
  args: { reviewerId: v.id('kohopReviewers') },
  returns: v.union(
    v.null(),
    v.object({
      contributionId: v.id('kohopContributions'),
      authorOrcid: v.union(v.string(), v.null()),
      reviewerOrcid: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { reviewerId }) => {
    const reviewer = await ctx.db.get(reviewerId);
    if (!reviewer?.userId) return null;
    const file = await ctx.db.get(reviewer.contributionId);
    if (!file) return null;
    const [a, b] = await Promise.all(
      [file.authorUserId, reviewer.userId].map((userId) =>
        ctx.db
          .query('memberProfiles')
          .withIndex('by_userId', (q) => q.eq('userId', userId))
          .unique(),
      ),
    );
    return {
      contributionId: file._id,
      authorOrcid: a ? orcidOf(a.links) : null,
      reviewerOrcid: b ? orcidOf(b.links) : null,
    };
  },
});

export const record = internalMutation({
  args: {
    contributionId: v.id('kohopContributions'),
    reviewerId: v.id('kohopReviewers'),
    failed: v.boolean(),
    error: v.optional(v.string()),
    finding: v.optional(
      v.object({ detail: v.string(), url: v.optional(v.string()) }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reviewer = await ctx.db.get(args.reviewerId);
    if (!reviewer) return null;
    const findings = args.finding
      ? [
          {
            type: 'external_cosign' as const,
            detail: args.finding.detail,
            source: 'OpenAlex',
            url: args.finding.url,
          },
        ]
      : [];
    await ctx.db.insert('kohopLinkChecks', {
      contributionId: args.contributionId,
      reviewerId: args.reviewerId,
      level: levelOf(findings),
      findings,
      origin: 'external',
      model: 'openalex',
      failed: args.failed || undefined,
      error: args.error,
      checkedAt: Date.now(),
    });
    if (findings.length > 0) {
      await ctx.db.patch(args.reviewerId, {
        flags: [...new Set([...reviewer.flags, 'external_cosign' as const])],
      });
    }
    await recordKohopEvent(ctx, {
      contributionId: args.contributionId,
      kind: 'link_checked',
      metadata: { reviewerId: args.reviewerId, origin: 'external' },
    });
    await recordAudit(ctx, {
      action: AUDIT.KOHOP_LINK_CHECKED,
      targetId: args.contributionId,
      metadata: {
        reviewerId: args.reviewerId,
        origin: 'external',
        failed: args.failed,
      },
    });
    return null;
  },
});

export const check = internalAction({
  args: { reviewerId: v.id('kohopReviewers') },
  returns: v.null(),
  handler: async (ctx, { reviewerId }) => {
    const info = await ctx.runQuery(internal.kohopLinkExternal.context, {
      reviewerId,
    });
    if (!info) return null;
    const base = { contributionId: info.contributionId, reviewerId };
    // No iD on one side: the check could not run, and it is said so.
    if (!info.authorOrcid || !info.reviewerOrcid) {
      await ctx.runMutation(internal.kohopLinkExternal.record, {
        ...base,
        failed: true,
        error: 'NO_ORCID',
      });
      return null;
    }
    try {
      const response = await fetch(
        coSignRequestUrl(info.authorOrcid, info.reviewerOrcid, Date.now()),
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const read = readCoSigned(await response.json());
      if (read === 'invalid') throw new Error('INVALID_ANSWER');
      await ctx.runMutation(internal.kohopLinkExternal.record, {
        ...base,
        failed: false,
        finding: read
          ? {
              detail: `${read.count} · ${read.title}${read.year ? ` (${read.year})` : ''}`,
              url: read.url || undefined,
            }
          : undefined,
      });
    } catch (err) {
      await ctx.runMutation(internal.kohopLinkExternal.record, {
        ...base,
        failed: true,
        error: err instanceof Error ? err.message.slice(0, 120) : 'ERROR',
      });
    }
    return null;
  },
});

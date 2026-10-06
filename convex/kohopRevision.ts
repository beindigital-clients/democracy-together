import { v, ConvexError } from 'convex/values';
import { mutation } from './_generated/server';
import { internal } from './_generated/api';
import { enforceRateLimit } from './lib/rateLimit';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { reviewChiefRecipients } from './lib/reviewChiefs';
import { KOHOP_BOUNDS, KOHOP_DELAYS_MS } from './lib/kohop';
import { countWords, validateBody } from './lib/kohopText';
import {
  advance,
  recordKohopEvent,
  requireOwnContribution,
  versionOf,
} from './lib/kohopAccess';
import { cleanFields } from './kohop';

// KOHOP — the AUTHOR's revision (K-15). Once both analyses are in, the author
// may revise the text (a new version, the reviewed one is kept), must reply to
// the reviewers (the reply is published with the analyses, D-9), and may ask
// once for a short extension. The review chief decides afterwards.

const HOUR = 60 * 60 * 1000;

const linkArg = v.object({
  label: v.string(),
  url: v.optional(v.string()),
  publicationId: v.optional(v.id('publications')),
});

function refuse(code: string): never {
  throw new ConvexError(code);
}

/** Saves the revised text. The first save creates the next version. */
export const saveRevision = mutation({
  args: {
    contributionId: v.id('kohopContributions'),
    title: v.string(),
    standfirst: v.string(),
    body: v.string(),
    links: v.array(linkArg),
  },
  returns: v.object({ version: v.number(), wordCount: v.number() }),
  handler: async (ctx, args) => {
    const { user, contribution } = await requireOwnContribution(
      ctx,
      args.contributionId,
    );
    if (contribution.stage !== 'revision') refuse('NOT_EDITABLE');
    await enforceRateLimit(ctx, {
      key: `kohop:save:${user._id}`,
      max: 240,
      windowMs: HOUR,
    });
    const clean = await cleanFields(ctx, {
      title: args.title,
      standfirst: args.standfirst,
      body: args.body,
      links: args.links,
      lang: contribution.lang,
      fields: contribution.fields,
      keywords: contribution.keywords,
      coAuthors: contribution.coAuthors,
      priorWorks: contribution.priorWorks,
    });
    const row = {
      title: clean.title,
      standfirst: clean.standfirst,
      body: clean.body,
      links: clean.links,
      wordCount: countWords(clean.body),
    };
    const now = Date.now();
    let version = contribution.currentVersion;
    if (contribution.reviewedVersion === version) {
      // First edit: the reviewed version stays as it was read.
      version += 1;
      await ctx.db.insert('kohopVersions', {
        contributionId: contribution._id,
        version,
        kind: 'revision',
        ...row,
        createdBy: user._id,
        createdAt: now,
      });
    } else {
      const current = await versionOf(ctx, contribution._id, version);
      if (!current) refuse('NOT_FOUND');
      await ctx.db.patch(current._id, row);
    }
    await ctx.db.patch(contribution._id, {
      title: clean.title,
      currentVersion: version,
      updatedAt: now,
    });
    return { version, wordCount: row.wordCount };
  },
});

/** Hands the revision in (text revised or kept) with the reply to the reviewers. */
export const submitRevision = mutation({
  args: {
    contributionId: v.id('kohopContributions'),
    response: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { contributionId, response }) => {
    const { user, contribution } = await requireOwnContribution(
      ctx,
      contributionId,
    );
    // The machine first: another stage writes nothing.
    const to = advance(contribution.stage, 'submitRevision');

    const reply = response.trim();
    const problem = validateBody(reply, {
      min: 1,
      max: KOHOP_BOUNDS.responseWords.max,
    });
    if (problem) {
      refuse(
        problem.code === 'unsupported'
          ? 'REPLY_UNSUPPORTED'
          : problem.code === 'too_short'
            ? 'REPLY_REQUIRED'
            : 'REPLY_TOO_LONG',
      );
    }

    const now = Date.now();
    let version = contribution.currentVersion;
    const current = await versionOf(ctx, contribution._id, version);
    if (!current) refuse('NOT_FOUND');
    const words = validateBody(current.body, KOHOP_BOUNDS.words);
    if (words) {
      refuse(
        words.code === 'unsupported'
          ? 'BODY_UNSUPPORTED'
          : words.code === 'too_short'
            ? 'BODY_TOO_SHORT'
            : 'BODY_TOO_LONG',
      );
    }
    if (contribution.reviewedVersion === version) {
      // Text kept as it is: a revision version all the same, so the reply and
      // the date belong to a version of their own.
      version += 1;
      await ctx.db.insert('kohopVersions', {
        contributionId: contribution._id,
        version,
        kind: 'revision',
        title: current.title,
        standfirst: current.standfirst,
        body: current.body,
        links: current.links,
        wordCount: current.wordCount,
        responseToReviewers: reply,
        createdBy: user._id,
        createdAt: now,
      });
    } else {
      await ctx.db.patch(current._id, { responseToReviewers: reply });
    }
    await ctx.db.patch(contribution._id, {
      stage: to,
      currentVersion: version,
      submittedVersion: version,
      revisionDueAt: undefined,
      revisionReminders: undefined,
      updatedAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: contribution._id,
      kind: 'submitRevision',
      actorId: user._id,
      metadata: { version },
    });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.KOHOP_REVISION_SUBMITTED,
      targetId: contribution._id,
    });
    await ctx.scheduler.runAfter(0, internal.kohopOriginality.runAll, {
      contributionId: contribution._id,
      version,
    });
    for (const chief of await reviewChiefRecipients(ctx)) {
      await notify(ctx, {
        userId: chief._id,
        type: 'kohop_revision_submitted',
        titleKey: 'kohopRevisionSubmitted',
        params: { title: contribution.title },
        link: `/admin/kohop/${contribution._id}`,
      });
    }
    return null;
  },
});

/** One extension of the deadline (7 days), for the author who needs more time. */
export const requestExtension = mutation({
  args: { contributionId: v.id('kohopContributions') },
  returns: v.number(),
  handler: async (ctx, { contributionId }) => {
    const { user, contribution } = await requireOwnContribution(
      ctx,
      contributionId,
    );
    if (contribution.stage !== 'revision') refuse('INVALID_TRANSITION');
    if (contribution.revisionExtendedAt !== undefined) {
      refuse('EXTENSION_USED');
    }
    const now = Date.now();
    const dueAt =
      (contribution.revisionDueAt ?? now) + KOHOP_DELAYS_MS.extension;
    await ctx.db.patch(contribution._id, {
      revisionDueAt: dueAt,
      revisionExtendedAt: now,
      revisionReminders: 0,
      updatedAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: contribution._id,
      kind: 'revision_extended',
      actorId: user._id,
    });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.KOHOP_REVISION_EXTENDED,
      targetId: contribution._id,
      metadata: { dueAt },
    });
    return dueAt;
  },
});

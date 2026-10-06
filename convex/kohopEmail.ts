import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalAction, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { locale } from './schema';
import { sendEmail } from './email';
import { isReservedEmail } from './lib/validation';
import { reviewChiefRecipients } from './lib/reviewChiefs';
import { versionOf } from './lib/kohopAccess';
import {
  authorEmail,
  chiefNewSubmissionEmail,
  KOHOP_AUTHOR_EMAIL_KINDS,
  KOHOP_PRODUCTION_EMAIL_KINDS,
  productionEmail,
  reviewerEmail,
} from './lib/kohopEmails';

// KOHOP — e-mails are sent from SCHEDULED ACTIONS (`runAfter(0)`): a mutation
// cannot make a network call, and a send failure must not undo the action that
// triggered it. One failure does not deprive the other recipients.

export const submissionAlertContext = internalQuery({
  args: { contributionId: v.id('kohopContributions') },
  returns: v.union(
    v.null(),
    v.object({
      title: v.string(),
      authorName: v.string(),
      words: v.number(),
      recipients: v.array(v.object({ email: v.string(), locale })),
    }),
  ),
  handler: async (ctx, { contributionId }) => {
    const contribution = await ctx.db.get(contributionId);
    if (!contribution) return null;
    const version = await versionOf(
      ctx,
      contributionId,
      contribution.submittedVersion ?? contribution.currentVersion,
    );
    const author = await ctx.db.get(contribution.authorUserId);
    const recipients = (await reviewChiefRecipients(ctx))
      .filter((u) => u.email && !isReservedEmail(u.email))
      .map((u) => ({
        email: u.email as string,
        locale: u.preferredLocale ?? ('fr' as const),
      }));
    return {
      title: contribution.title,
      authorName: author?.name?.trim() || author?.email || '—',
      words: version?.wordCount ?? 0,
      recipients,
    };
  },
});

export const alertChiefsOfSubmission = internalAction({
  args: { contributionId: v.id('kohopContributions') },
  returns: v.null(),
  handler: async (ctx, { contributionId }) => {
    const info = await ctx.runQuery(
      internal.kohopEmail.submissionAlertContext,
      { contributionId },
    );
    if (!info || info.recipients.length === 0) return null;
    const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000';
    const failures: string[] = [];
    for (const recipient of info.recipients) {
      const { subject, html } = chiefNewSubmissionEmail({
        siteUrl,
        locale: recipient.locale,
        contributionId,
        title: info.title,
        authorName: info.authorName,
        words: info.words,
      });
      try {
        await sendEmail({ to: recipient.email, subject, html });
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (failures.length > 0) {
      console.error(
        `KOHOP submission alert: ${failures.length}/${info.recipients.length} not sent (${failures[0]})`,
      );
    }
    return null;
  },
});

// --- To a reviewer: invitation and reminder -------------------------------------

export const reviewerEmailContext = internalQuery({
  args: { reviewerId: v.id('kohopReviewers') },
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      locale,
      title: v.string(),
      dueAt: v.number(),
    }),
  ),
  handler: async (ctx, { reviewerId }) => {
    const reviewer = await ctx.db.get(reviewerId);
    // Nothing to send once the invitation is answered or expired.
    if (
      !reviewer?.userId ||
      reviewer.dueAt === undefined ||
      (reviewer.status !== 'invited' && reviewer.status !== 'accepted')
    ) {
      return null;
    }
    const user = await ctx.db.get(reviewer.userId);
    const file = await ctx.db.get(reviewer.contributionId);
    if (!user?.email || isReservedEmail(user.email) || !file) return null;
    return {
      email: user.email,
      locale: user.preferredLocale ?? ('fr' as const),
      title: file.title,
      dueAt: reviewer.dueAt,
    };
  },
});

export const sendReviewerEmail = internalAction({
  args: {
    reviewerId: v.id('kohopReviewers'),
    kind: v.union(v.literal('invitation'), v.literal('reminder')),
  },
  returns: v.null(),
  handler: async (ctx, { reviewerId, kind }) => {
    const info = await ctx.runQuery(internal.kohopEmail.reviewerEmailContext, {
      reviewerId,
    });
    if (!info) return null;
    const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000';
    const dueLabel = new Intl.DateTimeFormat(info.locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(info.dueAt);
    const { subject, html } = reviewerEmail({
      siteUrl,
      locale: info.locale,
      reviewerId,
      title: info.title,
      dueLabel,
      kind,
    });
    try {
      await sendEmail({ to: info.email, subject, html });
    } catch (err) {
      console.error(
        `KOHOP reviewer e-mail not sent (${err instanceof Error ? err.message : String(err)})`,
      );
    }
    return null;
  },
});

// --- To the author: the milestones of the file ---------------------------------

export const authorEmailContext = internalQuery({
  args: { contributionId: v.id('kohopContributions') },
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      locale,
      title: v.string(),
      dueAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, { contributionId }) => {
    const file = await ctx.db.get(contributionId);
    if (!file) return null;
    const user = await ctx.db.get(file.authorUserId);
    if (!user?.email || isReservedEmail(user.email)) return null;
    return {
      email: user.email,
      locale: user.preferredLocale ?? ('fr' as const),
      title: file.title,
      dueAt: file.revisionDueAt ?? null,
    };
  },
});

export const sendAuthorEmail = internalAction({
  args: {
    contributionId: v.id('kohopContributions'),
    kind: v.union(...KOHOP_AUTHOR_EMAIL_KINDS.map((k) => v.literal(k))),
  },
  returns: v.null(),
  handler: async (ctx, { contributionId, kind }) => {
    const info = await ctx.runQuery(internal.kohopEmail.authorEmailContext, {
      contributionId,
    });
    if (!info) return null;
    const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000';
    const showDue =
      info.dueAt !== null &&
      (kind === 'reviewsReady' || kind === 'revisionReminder');
    const { subject, html } = authorEmail({
      siteUrl,
      locale: info.locale,
      contributionId,
      title: info.title,
      dueLabel:
        showDue && info.dueAt !== null
          ? new Intl.DateTimeFormat(info.locale, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            }).format(info.dueAt)
          : undefined,
      kind,
    });
    try {
      await sendEmail({ to: info.email, subject, html });
    } catch (err) {
      console.error(
        `KOHOP author e-mail not sent (${err instanceof Error ? err.message : String(err)})`,
      );
    }
    return null;
  },
});

// --- Production and publication ---------------------------------------------------

export const productionEmailContext = internalQuery({
  args: {
    contributionId: v.id('kohopContributions'),
    kind: v.union(...KOHOP_PRODUCTION_EMAIL_KINDS.map((k) => v.literal(k))),
  },
  returns: v.object({
    title: v.string(),
    slug: v.union(v.string(), v.null()),
    dueAt: v.union(v.number(), v.null()),
    recipients: v.array(
      v.object({ email: v.string(), locale, inviteToJoin: v.boolean() }),
    ),
  }),
  handler: async (ctx, { contributionId, kind }) => {
    const file = await ctx.db.get(contributionId);
    const empty = {
      title: '',
      slug: null,
      dueAt: null,
      recipients: [] as {
        email: string;
        locale: 'fr' | 'en' | 'es' | 'pt' | 'ar';
        inviteToJoin: boolean;
      }[],
    };
    if (!file) return empty;
    const userIds: Id<'users'>[] = [];
    if (kind === 'publishedReviewer') {
      // Reviewers whose signed analysis is published (consent given).
      const rows = await ctx.db
        .query('kohopReviewers')
        .withIndex('by_contribution', (q) =>
          q.eq('contributionId', contributionId),
        )
        .take(30);
      for (const r of rows) {
        if (r.status === 'submitted' && r.userId && r.publicationConsentAt) {
          userIds.push(r.userId);
        }
      }
    } else {
      userIds.push(file.authorUserId);
    }
    const recipients = [];
    for (const id of userIds) {
      const user = await ctx.db.get(id);
      if (user?.email && !isReservedEmail(user.email)) {
        recipients.push({
          email: user.email,
          locale: user.preferredLocale ?? ('fr' as const),
          // An external reviewer (no rank): invited to join the network.
          inviteToJoin:
            kind === 'publishedReviewer' &&
            (user.role === undefined || user.role === 'visiteur'),
        });
      }
    }
    return {
      title: file.title,
      slug: file.slug ?? null,
      dueAt: file.proofDueAt ?? null,
      recipients,
    };
  },
});

export const sendProductionEmail = internalAction({
  args: {
    contributionId: v.id('kohopContributions'),
    kind: v.union(...KOHOP_PRODUCTION_EMAIL_KINDS.map((k) => v.literal(k))),
  },
  returns: v.null(),
  handler: async (ctx, { contributionId, kind }) => {
    const info = await ctx.runQuery(
      internal.kohopEmail.productionEmailContext,
      { contributionId, kind },
    );
    const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000';
    let failures = 0;
    for (const recipient of info.recipients) {
      const { subject, html } = productionEmail({
        siteUrl,
        locale: recipient.locale,
        contributionId,
        slug: info.slug ?? undefined,
        title: info.title,
        inviteToJoin: recipient.inviteToJoin,
        dueLabel:
          kind === 'proofToApprove' && info.dueAt !== null
            ? new Intl.DateTimeFormat(recipient.locale, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              }).format(info.dueAt)
            : undefined,
        kind,
      });
      try {
        await sendEmail({ to: recipient.email, subject, html });
      } catch {
        failures += 1;
      }
    }
    if (failures > 0) {
      console.error(
        `KOHOP production e-mail: ${failures}/${info.recipients.length} not sent`,
      );
    }
    return null;
  },
});

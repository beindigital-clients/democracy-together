import { v } from 'convex/values';
import { internalAction, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { locale } from './schema';
import { sendEmail } from './email';
import { isReservedEmail } from './lib/validation';
import { reviewChiefRecipients } from './lib/reviewChiefs';
import { versionOf } from './lib/kohopAccess';
import { chiefNewSubmissionEmail, reviewerEmail } from './lib/kohopEmails';

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

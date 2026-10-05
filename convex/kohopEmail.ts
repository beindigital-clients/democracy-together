import { v } from 'convex/values';
import { internalAction, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { locale } from './schema';
import { sendEmail } from './email';
import { isReservedEmail } from './lib/validation';
import { reviewChiefRecipients } from './lib/reviewChiefs';
import { versionOf } from './lib/kohopAccess';
import { chiefNewSubmissionEmail } from './lib/kohopEmails';

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

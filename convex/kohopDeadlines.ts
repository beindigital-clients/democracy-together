import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { KOHOP_REMINDERS } from './lib/kohop';
import { deadlineAction } from './lib/kohopDeadlines';
import { advance, recordKohopEvent } from './lib/kohopAccess';
import { reviewChiefRecipients } from './lib/reviewChiefs';
import { replaceTitular, scheduleAuthorEmail } from './lib/kohopReviewing';
import { handleProofDeadlines } from './kohopProduction';

// KOHOP — the deadline cron (hourly). `kohopReviewers.dueAt` is set ONLY while
// a reply or an analysis is awaited, so the `by_dueAt` index holds nothing but
// what must be watched. One batch per run; the rest waits for the next one
// (a backlog drains, it never blocks).

export const run = internalMutation({
  args: {},
  returns: v.object({ reminded: v.number(), expired: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query('kohopReviewers')
      .withIndex('by_dueAt', (q) =>
        q.gt('dueAt', 0).lte('dueAt', now + KOHOP_REMINDERS.beforeDeadlineMs),
      )
      .take(KOHOP_REMINDERS.batch);

    let reminded = 0;
    let expired = 0;
    for (const reviewer of rows) {
      if (reviewer.dueAt === undefined) continue;
      if (reviewer.status !== 'invited' && reviewer.status !== 'accepted') {
        continue;
      }
      const file = await ctx.db.get(reviewer.contributionId);
      if (!file) continue;
      const action = deadlineAction({
        dueAt: reviewer.dueAt,
        remindersSent: reviewer.remindersSent,
        now,
      });

      if (action === 'remind') {
        await ctx.db.patch(reviewer._id, {
          remindersSent: reviewer.remindersSent + 1,
          updatedAt: now,
        });
        if (reviewer.userId) {
          await notify(ctx, {
            userId: reviewer.userId,
            type: 'kohop_review_reminder',
            titleKey: 'kohopReviewReminder',
            params: { title: file.title },
            link: `/espace-membre/relectures/${reviewer._id}`,
          });
          await ctx.scheduler.runAfter(
            0,
            internal.kohopEmail.sendReviewerEmail,
            { reviewerId: reviewer._id, kind: 'reminder' },
          );
        }
        reminded += 1;
      } else if (action === 'expire') {
        await ctx.db.patch(reviewer._id, {
          status: 'expired',
          dueAt: undefined,
          updatedAt: now,
        });
        await recordKohopEvent(ctx, {
          contributionId: file._id,
          kind: 'reviewer_expired',
          metadata: { reviewerId: reviewer._id },
        });
        await recordAudit(ctx, {
          action: AUDIT.KOHOP_REVIEWER_EXPIRED,
          targetId: file._id,
          metadata: { reviewerId: reviewer._id },
        });
        if (reviewer.userId) {
          await notify(ctx, {
            userId: reviewer.userId,
            type: 'kohop_review_expired',
            titleKey: 'kohopReviewExpired',
            params: { title: file.title },
          });
        }
        if (file.stage === 'in_review' && reviewer.slot === 'titular') {
          await replaceTitular(ctx, file, reviewer);
        }
        expired += 1;
      }
    }

    // The author's revision deadline (14 days, once extendable).
    const files = await ctx.db
      .query('kohopContributions')
      .withIndex('by_stage_and_revisionDueAt', (q) =>
        q
          .eq('stage', 'revision')
          .gt('revisionDueAt', 0)
          .lte('revisionDueAt', now + KOHOP_REMINDERS.beforeDeadlineMs),
      )
      .take(KOHOP_REMINDERS.batch);
    for (const file of files) {
      if (file.revisionDueAt === undefined) continue;
      const action = deadlineAction({
        dueAt: file.revisionDueAt,
        remindersSent: file.revisionReminders ?? 0,
        now,
      });
      if (action === 'remind') {
        await ctx.db.patch(file._id, {
          revisionReminders: (file.revisionReminders ?? 0) + 1,
          updatedAt: now,
        });
        await notify(ctx, {
          userId: file.authorUserId,
          type: 'kohop_revision_reminder',
          titleKey: 'kohopRevisionReminder',
          // ISO date: the same in every language.
          params: {
            title: file.title,
            date: new Date(file.revisionDueAt).toISOString().slice(0, 10),
          },
          link: `/espace-membre/kohop/${file._id}`,
        });
        await scheduleAuthorEmail(ctx, file._id, 'revisionReminder');
        reminded += 1;
      } else if (action === 'expire') {
        // The deadline passed: the chief decides from the reviewed version.
        await ctx.db.patch(file._id, {
          stage: advance(file.stage, 'revisionExpired'),
          revisionDueAt: undefined,
          revisionReminders: undefined,
          updatedAt: now,
        });
        await recordKohopEvent(ctx, {
          contributionId: file._id,
          kind: 'revisionExpired',
        });
        await recordAudit(ctx, {
          action: AUDIT.KOHOP_REVISION_EXPIRED,
          targetId: file._id,
        });
        await notify(ctx, {
          userId: file.authorUserId,
          type: 'kohop_revision_expired',
          titleKey: 'kohopRevisionExpired',
          params: { title: file.title },
          link: `/espace-membre/kohop/${file._id}`,
        });
        await scheduleAuthorEmail(ctx, file._id, 'revisionExpired');
        for (const chief of await reviewChiefRecipients(ctx)) {
          await notify(ctx, {
            userId: chief._id,
            type: 'kohop_decision_due',
            titleKey: 'kohopDecisionDue',
            params: { title: file.title },
            link: `/admin/kohop/${file._id}`,
          });
        }
        expired += 1;
      }
    }
    // The author's proof (5 days).
    const proofs = await handleProofDeadlines(ctx, now);
    reminded += proofs.reminded;
    expired += proofs.expired;
    return { reminded, expired };
  },
});

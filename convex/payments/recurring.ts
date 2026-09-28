import { v } from 'convex/values';
import { internal } from '../_generated/api';
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { sendEmail } from '../email';
import { providerForCurrency, siteUrl } from '../lib/payments/config';
import { randomToken } from '../lib/payments/crypto';
import { recurringReminderEmail } from '../lib/payments/emails';
import {
  currencyValidator,
  providerIdValidator,
} from '../lib/payments/validators';
import { openCheckout, type CreatedCheckout } from './checkout';

// MONTHLY DONATION BY REMINDER (F-28) — for providers that do not collect
// themselves. Stripe collects (native subscription); this path currently serves the
// fake provider, and would serve a mobile money provider, which
// does not allow recurring debits without action from the payer.
//
// Every day, for each active commitment whose due date has passed: a
// new payment request is opened with the provider and its link is
// emailed. Once paid, it moves the due date forward by one month (ledger).
// Left unanswered, it is resent at most every RESEND_AFTER days;
// after MAX_REMINDERS reminders, the commitment becomes "overdue" and
// is no longer reminded — a donor who no longer responds is not harassed.

const DAY = 24 * 60 * 60 * 1000;
export const RESEND_AFTER = 7 * DAY;
export const MAX_REMINDERS = 3;
const BATCH = 50;

export const dueReminders = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.id('paymentSubscriptions')),
  handler: async (ctx, { now }) => {
    const due = await ctx.db
      .query('paymentSubscriptions')
      .withIndex('by_status_and_nextDueAt', (q) =>
        q.eq('status', 'active').lte('nextDueAt', now),
      )
      .take(BATCH * 4);
    return due
      .filter(
        (s) =>
          s.mode === 'reminder' &&
          (s.lastReminderAt === undefined ||
            now - s.lastReminderAt >= RESEND_AFTER),
      )
      .slice(0, BATCH)
      .map((s) => s._id);
  },
});

// Prepares the reminder for ONE commitment: suspends it if it has used up its reminders,
// otherwise creates the payment request and records the reminder — in the same
// transaction, so that a replayed cron does not remind twice.
export const prepareReminder = internalMutation({
  args: { subscriptionId: v.id('paymentSubscriptions'), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      checkoutId: v.id('paymentCheckouts'),
      ref: v.string(),
      provider: providerIdValidator,
    }),
  ),
  handler: async (ctx, { subscriptionId, now }) => {
    const sub = await ctx.db.get(subscriptionId);
    if (!sub || sub.status !== 'active' || sub.mode !== 'reminder') return null;
    if (sub.nextDueAt > now) return null;
    if (
      sub.lastReminderAt !== undefined &&
      now - sub.lastReminderAt < RESEND_AFTER
    ) {
      return null;
    }
    if (sub.reminderCount >= MAX_REMINDERS) {
      await ctx.db.patch(sub._id, { status: 'past_due' });
      return null;
    }
    // The original provider if it is still there, otherwise the currency's one.
    const provider = providerForCurrency(sub.currency);
    if (!provider) return null;
    const ref = randomToken(16);
    const checkoutId: Id<'paymentCheckouts'> = await ctx.db.insert(
      'paymentCheckouts',
      {
        ref,
        provider,
        purpose: 'donation',
        currency: sub.currency,
        amountMinor: sub.amountMinor,
        recurring: true,
        status: 'created',
        ...(sub.userId ? { userId: sub.userId } : {}),
        email: sub.email,
        ...(sub.name ? { name: sub.name } : {}),
        locale: sub.locale,
        subscriptionId: sub._id,
        createdAt: now,
      },
    );
    await ctx.db.patch(sub._id, {
      reminderCount: sub.reminderCount + 1,
      lastReminderAt: now,
    });
    return { checkoutId, ref, provider };
  },
});

export const reminderTarget = internalQuery({
  args: { subscriptionId: v.id('paymentSubscriptions') },
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      name: v.union(v.string(), v.null()),
      locale: v.union(
        v.literal('fr'),
        v.literal('en'),
        v.literal('es'),
        v.literal('pt'),
        v.literal('ar'),
      ),
      currency: currencyValidator,
      amountMinor: v.number(),
    }),
  ),
  handler: async (ctx, { subscriptionId }) => {
    const sub = await ctx.db.get(subscriptionId);
    if (!sub) return null;
    return {
      email: sub.email,
      name: sub.name ?? null,
      locale: sub.locale,
      currency: sub.currency,
      amountMinor: sub.amountMinor,
    };
  },
});

export const sendDueReminders = internalAction({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const ids: Id<'paymentSubscriptions'>[] = await ctx.runQuery(
      internal.payments.recurring.dueReminders,
      { now },
    );
    let sent = 0;
    for (const subscriptionId of ids) {
      const prepared = await ctx.runMutation(
        internal.payments.recurring.prepareReminder,
        {
          subscriptionId,
          now,
        },
      );
      if (!prepared) continue;
      const target = await ctx.runQuery(
        internal.payments.recurring.reminderTarget,
        {
          subscriptionId,
        },
      );
      if (!target) continue;
      try {
        const created: CreatedCheckout = {
          checkoutId: prepared.checkoutId,
          ref: prepared.ref,
          provider: prepared.provider,
          purpose: 'donation',
          currency: target.currency,
          amountMinor: target.amountMinor,
          recurring: true,
          email: target.email,
          ...(target.name ? { name: target.name } : {}),
          locale: target.locale,
        };
        const { redirectUrl } = await openCheckout(ctx, created);
        // The fake provider returns a site-relative address.
        const payUrl = redirectUrl.startsWith('/')
          ? `${siteUrl()}${redirectUrl}`
          : redirectUrl;
        const { subject, html } = recurringReminderEmail({
          amountMinor: target.amountMinor,
          currency: target.currency,
          payUrl,
          locale: target.locale,
        });
        await sendEmail({ to: target.email, subject, html });
        sent++;
      } catch (err) {
        // The reminder is counted (it was attempted): a send failure must
        // not cause the same donor to be reminded on every cron run.
        console.error(`[payments] relance ${subscriptionId} non envoyée`, err);
      }
    }
    return sent;
  },
});

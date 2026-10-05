import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

// Backend scheduled tasks. NB: we use `crons.cron` (and not the
// `crons.daily` helper) in line with the project's Convex guidelines — the expression
// below is equivalent to "every day at 07:00 UTC".
const crons = cronJobs();

// F-55 — Event reminders: every day at 07:00 UTC, sends the reminders
// whose date is approaching (≤ 2 days). sendEmail is a NO-OP without a provider key.
crons.cron(
  'event-reminders',
  '0 7 * * *',
  internal.eventReminders.sendDueReminders,
  {},
);

// F-28 — Monthly donations without automatic debit (provider without
// subscriptions; Stripe debits by itself): every day at 08:10 UTC, sends the payment
// link for installments that have come due. Offset minute: tasks on the exact hour
// jostle each other at the host.
crons.cron(
  'payments-recurring-reminders',
  '10 8 * * *',
  internal.payments.recurring.sendDueReminders,
  {},
);
// Distribution workstream (F-18 / F-66).
// Double opt-in: never-confirmed sign-ups are deleted when
// their link expires (minimization). Every hour, at minute 17.
crons.cron(
  'newsletter-purge-pending',
  '17 * * * *',
  internal.newsletter.purgeExpiredPending,
  {},
);
// Audience measurement: raw events become per-day counters
// and are deleted — none lives more than a few minutes.
crons.interval(
  'audience-aggregate',
  { minutes: 5 },
  internal.audience.aggregate,
  {},
);
// Bounded retention of aggregates (AUDIENCE_RETENTION_DAYS, 13 months by default).
crons.cron('audience-purge', '43 3 * * *', internal.audience.purge, {});
// F-59 — Mentoring: every day at 06:30 UTC, alerts the coordinator about
// active pairs with no session logged for four weeks
// (INACTIVITY_WEEKS, convex/lib/programmes.ts). One alert per period
// of inactivity, not one per night.
crons.cron(
  'mentoring-inactivity',
  '30 6 * * *',
  internal.mentoring.checkInactivity,
  {},
);
// F-43 — Reviewer reminders: every day at 06:13 UTC (minute offset from
// the full hour, where tasks concentrate), reviews whose
// deadline has passed receive a reminder — at most three, spaced
// three days apart — then the editor who assigned the reviewer is notified.
crons.cron(
  'peer-review-reminders',
  '13 6 * * *',
  internal.peerReview.sendDueReminders,
  {},
);

// KOHOP — reviewers' deadlines: reminders, then expiry and replacement by the
// substitute. Every hour, at minute 23.
crons.cron('kohop-deadlines', '23 * * * *', internal.kohopDeadlines.run, {});

export default crons;

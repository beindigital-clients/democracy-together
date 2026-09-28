import { v, ConvexError } from 'convex/values';
import {
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from './_generated/server';
import { internal } from './_generated/api';
import { isEmail } from './lib/validation';
import {
  enforcePublicFormLimit,
  enforceRateLimit,
  RATE_LIMITS,
} from './lib/rateLimit';
import { enforceRecaptcha } from './lib/recaptcha';
import { sendEmail } from './email';
import { eventReminderEmail, eventVisioEmail } from './lib/emailContent';
import { locale } from './schema';
import { findEventBySlug, requireOpenEvent } from './lib/contenus/events';
import { pickText } from './lib/contenus/i18n';

// E-mail event reminders (F-55). A visitor — without an account — asks to
// be notified before an upcoming event. The request is stored (sent:false);
// a daily cron (convex/crons.ts) triggers `sendDueReminders`, which sends
// the reminders whose date is approaching then marks them `sent:true`. Actual
// sending goes through the generic `sendEmail` adapter (convex/email.ts): without
// a provider key (dev/test) it is a NO-OP — no real e-mail is sent. Intended.

// Sending window: we notify at most 2 days before the event.
const REMINDER_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

// PENDING reminders tolerated for a single address (pentest M-5). Details of
// the reasoning and the measurement in `storeReminder`.
const MAX_PENDING_REMINDERS_PER_EMAIL = 5;

// VALIDATION AGAINST THE TABLE (pentest M-5, closed by the "contenus"
// workstream). The pentest asked to "validate eventSlug against the real
// list and compute eventDate server-side"; the backend did not know about
// events, which lived in the Next repository. They are now in
// `contentEvents`: the slug is checked against the table (unknown, draft,
// cancelled or past -> `EVENT_CLOSED`) and the reminder date is the event's
// `startsAt`. The `eventDate` argument is still ACCEPTED so as not to break a
// cached client, but it is IGNORED.

// --- Public reminder request (F-55) -----------------------------------------
// No account needed (like the F-53 registration). Validates the e-mail, bounds
// the slug, rate-limits per address (reuses RATE_LIMITS.apply), deduplicates on
// (eventSlug, email): asking again = idempotent success, no duplicate.
// Anti-spam gate: the action verifies reCAPTCHA v3 (the reminder goes out by
// e-mail to an address supplied by the caller -> abuse vector) then delegates to
// `storeReminder` (internalMutation -> cannot be bypassed).
export const requestReminder = action({
  args: {
    eventSlug: v.string(),
    email: v.string(),
    // Ignored: the date comes from the table (cf. header).
    eventDate: v.optional(v.number()),
    locale: v.optional(locale),
    captchaToken: v.optional(v.string()),
  },
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'event_reminder');
    // EXISTENCE ORACLE CLOSED (pentest M-8, audit F-09).
    //
    // The internal mutation still distinguishes "already known" from "new" —
    // it needs to, so as not to duplicate or double-count. But this
    // distinction NO LONGER CROSSES the public boundary: this action is
    // open, unauthenticated, and returned `already: true/false`. A single
    // request was thus enough to know whether a given address is in our
    // lists — membership of an activist network, registration to an event.
    // The per-IP and per-form caps slow down enumeration; they
    // change nothing for a targeted check, which costs a single call.
    //
    // The response is now IDENTICAL in both cases. Nothing is lost
    // product-wise: no form read `already` — all display the
    // same success message (checked on all five).
    await ctx.runMutation(internal.eventReminders.storeReminder, input);
    return { ok: true };
  },
});

export const storeReminder = internalMutation({
  args: {
    eventSlug: v.string(),
    email: v.string(),
    eventDate: v.optional(v.number()),
    locale: v.optional(locale),
  },
  handler: async (ctx, args) => {
    const eventSlug = args.eventSlug.trim();
    const email = args.email.trim().toLowerCase();
    if (!eventSlug || eventSlug.length > 100) throw new Error('INVALID_EVENT');
    if (!isEmail(email)) throw new Error('INVALID_EMAIL');

    // CAP ON UNSENT REMINDERS PER ADDRESS (pentest M-5).
    //
    // What the measurement showed, with a PoC: deduplication is on
    // (eventSlug, email), and the slug is not validated against real
    // events — only bounded to 100 characters. Varying the slug thus gave a
    // fresh slot every time, and five reminders to a THIRD-PARTY address
    // were recorded before the hourly cap kicked in. That cap
    // replenishes: five more the next hour, a hundred and twenty a day, all
    // going out from the site's domain at 07:00 UTC.
    //
    // The cap below does not replenish on its own: it counts
    // PENDING reminders. Once the queue is full for an address, nothing more
    // gets in until they have been sent. Five is generous for
    // human use — there are fewer upcoming events than that.
    const enAttente = await ctx.db
      .query('eventReminders')
      .withIndex('by_email_and_sent', (q) =>
        q.eq('email', email).eq('sent', false),
      )
      .collect();
    if (enAttente.length >= MAX_PENDING_REMINDERS_PER_EMAIL) {
      throw new Error('TOO_MANY_PENDING_REMINDERS');
    }

    // The event must exist, be published and UPCOMING — a reminder for an
    // event that has started would never go out. The reminder date is the event's.
    const maintenant = Date.now();
    const event = await requireOpenEvent(ctx, eventSlug, maintenant);
    if (event.startsAt < maintenant) throw new ConvexError('EVENT_CLOSED');
    const eventDate = event.startsAt;

    // NON-FORGEABLE caps (audit M2) — per IP and global per form:
    // changing address no longer yields a fresh quota. Cf. lib/rateLimit.ts.
    await enforcePublicFormLimit(ctx, 'eventReminder');

    await enforceRateLimit(ctx, {
      key: `eventReminder:${email}`,
      ...RATE_LIMITS.apply,
    });

    const existing = await ctx.db
      .query('eventReminders')
      .withIndex('by_event_and_email', (q) =>
        q.eq('eventSlug', eventSlug).eq('email', email),
      )
      .unique();
    if (existing) return { ok: true, already: true };

    await ctx.db.insert('eventReminders', {
      eventSlug,
      email,
      locale: args.locale,
      eventDate,
      sent: false,
      createdAt: Date.now(),
    });
    return { ok: true, already: false };
  },
});

// --- Internal: sending reminders whose date is approaching ------------------
// Fetches unsent reminders whose `eventDate` falls within [now,
// now + 2 days]. Window filtering is done in memory (the table
// stays small); the by_sent index bounds the read to pending reminders.
//
// The event is re-read from the table: a reminder whose event was
// CANCELLED or unpublished in the meantime does not go out (it is skipped, not
// marked — if the event is republished, it will go out), and the e-mail carries
// the venue's time zone, without which a day in Paris was announced as the
// day before in UTC.
export const _dueReminders = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const pending = await ctx.db
      .query('eventReminders')
      .withIndex('by_sent', (q) => q.eq('sent', false))
      .take(2000);
    const horizon = now + REMINDER_WINDOW_MS;
    const out = [];
    for (const r of pending) {
      if (r.eventDate < now || r.eventDate > horizon) continue;
      const event = await findEventBySlug(ctx, r.eventSlug);
      if (!event || event.status !== 'published') continue;
      out.push({ ...r, timeZone: event.timezone });
    }
    return out;
  },
});

export const _markSent = internalMutation({
  args: { id: v.id('eventReminders') },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { sent: true });
  },
});

// --- Internal: videoconference link for registrants (F-54) ------------------
// A virtual room's link is never public. A signed-in registrant
// reads it on the record (`contenus/events:myVisioAccess`); every registrant —
// with or without an account — receives it by e-mail during the two days
// before the event. `visioSentAt` guarantees a single send per registration.
export const _dueVisioLinks = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const events = await ctx.db
      .query('contentEvents')
      .withIndex('by_status_and_startsAt', (q) =>
        q
          .eq('status', 'published')
          .gte('startsAt', now)
          .lte('startsAt', now + REMINDER_WINDOW_MS),
      )
      .take(100);
    const out = [];
    for (const event of events) {
      const visioUrl = event.visioUrl;
      if (!visioUrl) continue;
      const regs = await ctx.db
        .query('eventRegistrations')
        .withIndex('by_event_and_email', (q) => q.eq('eventSlug', event.slug))
        .take(5000);
      for (const r of regs) {
        if (r.visioSentAt !== undefined) continue;
        const loc = r.locale ?? 'fr';
        out.push({
          registrationId: r._id,
          email: r.email,
          locale: loc,
          eventSlug: event.slug,
          eventTitle: pickText(event.title, loc),
          eventDate: event.startsAt,
          timeZone: event.timezone,
          visioUrl,
        });
      }
    }
    return out;
  },
});

export const _markVisioSent = internalMutation({
  args: { id: v.id('eventRegistrations') },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { visioSentAt: Date.now() });
  },
});

// Scheduled action (daily cron). External e-mail calls live in an
// action, never in a mutation. For each due reminder: sendEmail (NO-OP
// without a key), then marking sent:true via an internal mutation. Same pass
// for the registrants' videoconference links.
export const sendDueReminders = internalAction({
  args: {},
  // Return type annotated explicitly: `handler` references
  // `internal.eventReminders.*`, whose types depend on this file's generated
  // API — without an annotation, TS loops (circular inference).
  handler: async (ctx): Promise<{ processed: number; visio: number }> => {
    const now = Date.now();
    const siteUrl =
      process.env.SITE_URL ?? 'https://democracy-together.vercel.app';
    const due = await ctx.runQuery(internal.eventReminders._dueReminders, {
      now,
    });
    for (const r of due) {
      // The row ALREADY carried the requester's language; it was only used to
      // build the URL. The subject, the body and the date format stayed
      // French — including for someone who had requested their reminder from
      // the Arabic version of the site.
      const loc = r.locale ?? 'fr';
      try {
        const { subject, html } = eventReminderEmail({
          eventSlug: r.eventSlug,
          eventDate: r.eventDate,
          timeZone: r.timeZone,
          siteUrl,
          locale: loc,
        });
        await sendEmail({ to: r.email, subject, html });
      } catch {
        // Sending failed (provider unavailable): we do NOT mark sent,
        // the next cron pass will retry.
        continue;
      }
      await ctx.runMutation(internal.eventReminders._markSent, { id: r._id });
    }

    const visio = await ctx.runQuery(internal.eventReminders._dueVisioLinks, {
      now,
    });
    for (const r of visio) {
      try {
        const { subject, html } = eventVisioEmail({
          eventSlug: r.eventSlug,
          eventTitle: r.eventTitle,
          eventDate: r.eventDate,
          timeZone: r.timeZone,
          visioUrl: r.visioUrl,
          siteUrl,
          locale: r.locale,
        });
        await sendEmail({ to: r.email, subject, html });
      } catch {
        continue;
      }
      await ctx.runMutation(internal.eventReminders._markVisioSent, {
        id: r.registrationId,
      });
    }
    return { processed: due.length, visio: visio.length };
  },
});

// DEV/TEST only (AUTH_DEV_OTP guard): checks the actual storage in E2E.
export const isReminderSet = internalQuery({
  args: { eventSlug: v.string(), email: v.string() },
  handler: async (ctx, { eventSlug, email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const r = await ctx.db
      .query('eventReminders')
      .withIndex('by_event_and_email', (q) =>
        q
          .eq('eventSlug', eventSlug.trim())
          .eq('email', email.trim().toLowerCase()),
      )
      .unique();
    return Boolean(r);
  },
});

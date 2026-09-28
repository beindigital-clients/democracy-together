import { v, ConvexError } from 'convex/values';
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { internal } from './_generated/api';
import { isEmail } from './lib/validation';

import {
  enforcePublicFormLimit,
  enforceRateLimit,
  RATE_LIMITS,
} from './lib/rateLimit';
import { enforceRecaptcha } from './lib/recaptcha';
import { requireNetworkRole } from './lib/rbac';
import { COUNTER, bumpCounter } from './lib/counters';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { locale } from './schema';
import {
  findEventBySlug,
  isEventFull,
  requireOpenEvent,
} from './lib/contenus/events';
import { pickText } from './lib/contenus/i18n';

// --- Public event registration (F-53) ---------------------------------------
// Online RSVP, no account needed. `eventSlug` is VALIDATED AGAINST THE
// `contentEvents` TABLE ("contenus" workstream, pentest item M-5): an unknown,
// draft, cancelled or finished event is refused with `EVENT_CLOSED`, an
// event whose capacity is reached with `EVENT_FULL`. Idempotent: the same
// address re-registered for the same event creates no duplicate. Rate-limited
// per address. Anti-spam gate: the action verifies reCAPTCHA v3 then delegates
// to `storeRegistration` (internalMutation -> cannot be bypassed).
export const registerForEvent = action({
  args: {
    eventSlug: v.string(),
    name: v.string(),
    email: v.string(),
    organization: v.optional(v.string()),
    locale: v.optional(locale),
    captchaToken: v.optional(v.string()),
  },
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'event_register');
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
    await ctx.runMutation(internal.events.storeRegistration, input);
    return { ok: true };
  },
});

export const storeRegistration = internalMutation({
  args: {
    eventSlug: v.string(),
    name: v.string(),
    email: v.string(),
    organization: v.optional(v.string()),
    locale: v.optional(locale),
  },
  handler: async (ctx, args) => {
    const eventSlug = args.eventSlug.trim();
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    if (!eventSlug || eventSlug.length > 100) throw new Error('INVALID_EVENT');
    // Unknown, draft, cancelled or past event: registration closed. Read
    // from the table, never from the call. `ConvexError` so that the form
    // says "inscriptions closes" rather than a generic failure.
    const event = await requireOpenEvent(ctx, eventSlug, Date.now());
    if (name.length < 2 || name.length > 120) throw new Error('INVALID_NAME');
    if (!isEmail(email)) throw new Error('INVALID_EMAIL');

    // NON-FORGEABLE caps (audit M2) — per IP and global per form:
    // changing address no longer yields a fresh quota. Cf. lib/rateLimit.ts.
    await enforcePublicFormLimit(ctx, 'eventRegister');

    await enforceRateLimit(ctx, {
      key: `eventRegister:${email}`,
      ...RATE_LIMITS.eventRegister,
    });

    const existing = await ctx.db
      .query('eventRegistrations')
      .withIndex('by_event_and_email', (q) =>
        q.eq('eventSlug', eventSlug).eq('email', email),
      )
      .unique();
    if (existing) return { ok: true, already: true };

    // Capacity checked AFTER deduplication: someone already registered
    // who resubmits the form for a full event is not refused.
    if (await isEventFull(ctx, event)) throw new ConvexError('EVENT_FULL');

    await ctx.db.insert('eventRegistrations', {
      eventSlug,
      name,
      email,
      organization: args.organization?.trim() || undefined,
      locale: args.locale,
      createdAt: Date.now(),
    });
    await bumpCounter(ctx, COUNTER.EVENT_REGISTRATIONS, 1);
    return { ok: true, already: false };
  },
});

// --- Back office: registration list (moderator and above) -------------------
// Each registration carries its event's TITLE, read from the table in the
// screen's language: the screen no longer has to look it up in a coded catalog.
export const listEventRegistrations = query({
  args: { locale: v.optional(locale) },
  returns: v.array(
    v.object({
      _id: v.id('eventRegistrations'),
      eventSlug: v.string(),
      eventTitle: v.union(v.string(), v.null()),
      eventStartsAt: v.union(v.number(), v.null()),
      name: v.string(),
      email: v.string(),
      organization: v.union(v.string(), v.null()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { locale: loc }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const all = await ctx.db.query('eventRegistrations').take(5000);
    const events = new Map<
      string,
      { title: string; startsAt: number } | null
    >();
    for (const slug of new Set(all.map((r) => r.eventSlug))) {
      const e = await findEventBySlug(ctx, slug);
      events.set(
        slug,
        e
          ? { title: pickText(e.title, loc ?? 'fr'), startsAt: e.startsAt }
          : null,
      );
    }
    return all
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        _id: r._id,
        eventSlug: r.eventSlug,
        eventTitle: events.get(r.eventSlug)?.title ?? null,
        eventStartsAt: events.get(r.eventSlug)?.startsAt ?? null,
        name: r.name,
        email: r.email,
        organization: r.organization ?? null,
        createdAt: r.createdAt,
      }));
  },
});

// CSV export of an event's registrants. A MUTATION and not a query: personal
// data leaves the system, so the action is LOGGED (a
// query cannot write). Same rank as the list that already displays them.
export const exportEventRegistrations = mutation({
  args: { eventSlug: v.string() },
  returns: v.array(
    v.object({
      name: v.string(),
      email: v.string(),
      organization: v.union(v.string(), v.null()),
      locale: v.union(locale, v.null()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { eventSlug }) => {
    const user = await requireNetworkRole(ctx, 'moderateur');
    const rows = await ctx.db
      .query('eventRegistrations')
      .withIndex('by_event_and_email', (q) => q.eq('eventSlug', eventSlug))
      .take(5000);
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.EVENT_REGISTRATIONS_EXPORTED,
      targetId: eventSlug,
      metadata: { count: rows.length },
    });
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({
        name: r.name,
        email: r.email,
        organization: r.organization ?? null,
        locale: r.locale ?? null,
        createdAt: r.createdAt,
      }));
  },
});

// DEV/TEST only (AUTH_DEV_OTP guard): checks the actual storage in E2E.
export const isRegistered = internalQuery({
  args: { eventSlug: v.string(), email: v.string() },
  handler: async (ctx, { eventSlug, email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const reg = await ctx.db
      .query('eventRegistrations')
      .withIndex('by_event_and_email', (q) =>
        q
          .eq('eventSlug', eventSlug.trim())
          .eq('email', email.trim().toLowerCase()),
      )
      .unique();
    return Boolean(reg);
  },
});

import { v } from 'convex/values';
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { internal } from './_generated/api';
import { isEmail, FIELD_MAX } from './lib/validation';
import {
  enforcePublicFormLimit,
  enforceRateLimit,
  RATE_LIMITS,
} from './lib/rateLimit';
import { enforceRecaptcha } from './lib/recaptcha';
import { requireNetworkRole } from './lib/rbac';
import { trackContactHandled } from './lib/counters';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';

const fields = {
  name: v.string(),
  email: v.string(),
  subject: v.string(),
  body: v.string(),
};

// Public contact form (F-17): validates server-side (defense in
// depth, the UI validates too) then stores the submission. Reading /
// processing will be done from the back office (F-26).
//
// Anti-spam GATE: the `submit` action first verifies the reCAPTCHA v3 token
// (only actions have `fetch`) then delegates to `store`. The business logic
// stays in an internalMutation -> not directly callable, so the captcha
// gate cannot be bypassed by targeting the mutation.
export const submit = action({
  args: { ...fields, captchaToken: v.optional(v.string()) },
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'contact');
    // Explicit annotation: breaks the TS type circularity (action -> generated
    // api -> action) when calling a function from the same module.
    const result: { ok: boolean } = await ctx.runMutation(
      internal.contact.store,
      input,
    );
    return result;
  },
});

export const store = internalMutation({
  args: fields,
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const email = args.email.trim();
    const subject = args.subject.trim();
    const body = args.body.trim();

    // UPPER bounds as well as lower ones (pentest M-2). Without them, this anonymous
    // form accepted ~1 MB per submission: measured, a body of 1,000,000
    // characters was written to the database as-is.
    if (name.length < 2 || name.length > FIELD_MAX.name) {
      throw new Error('INVALID_NAME');
    }
    if (!isEmail(email)) throw new Error('INVALID_EMAIL');
    if (subject.length < 2 || subject.length > FIELD_MAX.subject) {
      throw new Error('INVALID_SUBJECT');
    }
    if (body.length < 10 || body.length > FIELD_MAX.body) {
      throw new Error('INVALID_BODY');
    }

    // UNFORGEABLE caps (audit M2) — per IP and global per form:
    // changing address no longer yields a fresh quota. See lib/rateLimit.ts.
    await enforcePublicFormLimit(ctx, 'contact');

    await enforceRateLimit(ctx, {
      key: `contact:${email.toLowerCase()}`,
      ...RATE_LIMITS.contact,
    });

    await ctx.db.insert('contactMessages', {
      name,
      email,
      subject,
      body,
      handled: false,
      createdAt: Date.now(),
    });
    await trackContactHandled(ctx, null, false);
    return { ok: true };
  },
});

// DEV/TEST only (AUTH_DEV_OTP guard): reads back the last message from an
// address so the E2E can verify actual storage (see otp.latestDevCode).
export const latestForEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const all = await ctx.db.query('contactMessages').order('desc').collect();
    const m = all.find((x) => x.email === email);
    return m
      ? { name: m.name, subject: m.subject, body: m.body, handled: m.handled }
      : null;
  },
});

// --- Back office (F-17 / F-26) ----------------------------------------------
// Messages went into a black hole: no query read them back and
// `handled` was never updated (audit § 3.1). A visitor wrote to the
// secretariat, and nobody could read it.
//
// Reserved to moderators and above: these messages contain personal
// data (name, email address, free-form content).
export const listMessages = query({
  args: { status: v.optional(v.union(v.literal('pending'), v.literal('all'))) },
  handler: async (ctx, { status }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const msgs =
      status === 'all'
        ? await ctx.db.query('contactMessages').collect()
        : status === 'pending'
          ? await ctx.db
              .query('contactMessages')
              .withIndex('by_handled', (q) => q.eq('handled', false))
              .collect()
          : await ctx.db.query('contactMessages').collect();
    // TOTAL order: `createdAt` is in milliseconds, so two messages received
    // in the same millisecond are tied — and a comparator returning
    // 0 lets `Array.sort` keep the input order, i.e. the
    // OLDEST first. `_creationTime` (sub-millisecond precision) breaks the tie,
    // so that "most recent first" holds whatever the
    // arrival speed. Guard: convex/contact-admin.test.ts.
    return msgs.sort(
      (a, b) => b.createdAt - a.createdAt || b._creationTime - a._creationTime,
    );
  },
});

// "Handled" marking, reversible: a reopened message must be able to go back
// into the queue. Audited, like every back-office action.
export const setHandled = mutation({
  args: { messageId: v.id('contactMessages'), handled: v.boolean() },
  handler: async (ctx, { messageId, handled }) => {
    const actor = await requireNetworkRole(ctx, 'moderateur');
    const msg = await ctx.db.get(messageId);
    if (!msg) throw new Error('NOT_FOUND');
    await ctx.db.patch(messageId, { handled });
    await trackContactHandled(ctx, msg.handled, handled);
    await recordAudit(ctx, {
      actorId: actor._id,
      action: AUDIT.CONTACT_HANDLED,
      targetId: messageId,
      metadata: { handled: String(handled) },
    });
    return { ok: true };
  },
});

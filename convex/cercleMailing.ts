import { ConvexError, v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { requireNetworkRole } from './lib/rbac';
import { locale, type SiteLocale } from './lib/locales';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { clampPageSize, paginatedValidator } from './lib/pagination';
import {
  hashToken,
  isTokenShaped,
  newConfirmToken,
} from './lib/newsletterOptIn';
import {
  CERCLE_CONFIRM_MAX_SENDS,
  CERCLE_CONFIRM_TTL_MS,
  CERCLE_MAILING_TEXT_VERSION,
  IMPORT_BATCH_LABEL_MAX,
  isMailable,
  needsConfirmationSend,
  parseContactsCsv,
  senderIdentity,
} from './lib/cercleMailing';
import { newUnsubToken } from './lib/cercleContacts';
import { cercleConfirmationEmail } from './lib/cercleMailingContent';
import {
  deliveryConfig,
  idempotencyKey,
  msUntilNextUtcDay,
} from './lib/newsletterDelivery';
import { addSent, dailyRemaining } from './lib/emailQuota';
import {
  emailProviderStatus,
  sendEmailBatch,
  TransientEmailError,
} from './email';

// CERCLE DES AMIS — MAILING LIST (feature 5).
//
// A list of its own (`cercleContacts`), never shared with the newsletter, fed
// by the Cercle's accepted requests (confirmed at once) and by a CSV import of
// contacts who asked for nothing. Those receive ONE message — a confirmation
// request — and nothing else until they click. The campaigns themselves go
// through the same engine as the newsletter (convex/newsletter.ts), audience
// `cercle`.

const contactStatus = v.union(
  v.literal('pending'),
  v.literal('confirmed'),
  v.literal('unsubscribed'),
);

// --- Import -------------------------------------------------------------------------

export const importContacts = mutation({
  args: {
    csv: v.string(),
    // A label for the file ("liste-amis-2026"), kept with each contact as its
    // provenance. Never the content.
    batch: v.string(),
  },
  returns: v.object({
    added: v.number(),
    alreadyOnList: v.number(),
    suppressed: v.number(),
    unmailable: v.number(),
    duplicatesInFile: v.number(),
    invalid: v.array(
      v.object({
        line: v.number(),
        reason: v.union(v.literal('INVALID_EMAIL'), v.literal('EMPTY')),
      }),
    ),
    truncated: v.number(),
  }),
  handler: async (ctx, { csv, batch }) => {
    // Bulk personal data in: an administrator, like the other Cercle decisions.
    const admin = await requireNetworkRole(ctx, 'admin');
    const label = batch.trim().slice(0, IMPORT_BATCH_LABEL_MAX);
    if (!label) throw new ConvexError('INVALID_BATCH');
    const parsed = parseContactsCsv(csv);
    if (parsed.contacts.length === 0 && parsed.invalid.length === 0) {
      throw new ConvexError('EMPTY_FILE');
    }

    const now = Date.now();
    let added = 0;
    let alreadyOnList = 0;
    let suppressed = 0;
    let unmailable = 0;
    for (const c of parsed.contacts) {
      // Reserved test domains never get a message: counted, not written.
      if (!isMailable(c.email)) {
        unmailable++;
        continue;
      }
      const existing = await ctx.db
        .query('cercleContacts')
        .withIndex('by_email', (q) => q.eq('email', c.email))
        .unique();
      if (existing) {
        // Someone who said no is never written to again by an import.
        if (existing.status === 'unsubscribed') suppressed++;
        else alreadyOnList++;
        continue;
      }
      await ctx.db.insert('cercleContacts', {
        email: c.email,
        ...(c.locale ? { locale: c.locale } : {}),
        status: 'pending',
        source: 'import',
        unsubToken: newUnsubToken(),
        confirmSends: 0,
        toAsk: true,
        importedAt: now,
        importedBy: admin._id,
        importBatch: label,
        createdAt: now,
      });
      added++;
    }
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.CERCLE_CONTACTS_IMPORTED,
      targetId: label,
      metadata: {
        added,
        alreadyOnList,
        suppressed,
        invalid: parsed.invalid.length,
      },
    });
    return {
      added,
      alreadyOnList,
      suppressed,
      unmailable,
      duplicatesInFile: parsed.duplicatesInFile,
      invalid: parsed.invalid,
      truncated: parsed.truncated,
    };
  },
});

// --- What the president sees --------------------------------------------------------------

const COUNT_CAP = 5000;

export const stats = query({
  args: {},
  returns: v.object({
    pending: v.number(),
    toAsk: v.number(),
    confirmed: v.number(),
    unsubscribed: v.number(),
    capped: v.boolean(),
    sender: v.object({
      name: v.string(),
      address: v.string(),
      placeholder: v.boolean(),
    }),
    emailMode: v.union(
      v.literal('configured'),
      v.literal('simulated'),
      v.literal('none'),
    ),
  }),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'admin');
    let capped = false;
    const count = async (status: 'pending' | 'confirmed' | 'unsubscribed') => {
      const rows = await ctx.db
        .query('cercleContacts')
        .withIndex('by_status_and_expiry', (q) => q.eq('status', status))
        .take(COUNT_CAP + 1);
      if (rows.length > COUNT_CAP) capped = true;
      return rows.slice(0, COUNT_CAP);
    };
    const pending = await count('pending');
    const confirmed = await count('confirmed');
    const unsubscribed = await count('unsubscribed');
    return {
      pending: pending.length,
      toAsk: pending.filter(needsConfirmationSend).length,
      confirmed: confirmed.length,
      unsubscribed: unsubscribed.length,
      capped,
      sender: senderIdentity(),
      emailMode: emailProviderStatus().mode,
    };
  },
});

export const listContacts = query({
  args: { status: contactStatus, paginationOpts: paginationOptsValidator },
  returns: paginatedValidator(
    v.object({
      _id: v.id('cercleContacts'),
      email: v.string(),
      locale: v.union(locale, v.null()),
      source: v.union(v.literal('request'), v.literal('import')),
      importBatch: v.union(v.string(), v.null()),
      confirmSends: v.number(),
      confirmError: v.union(v.string(), v.null()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { status, paginationOpts }) => {
    await requireNetworkRole(ctx, 'admin');
    const result = await ctx.db
      .query('cercleContacts')
      .withIndex('by_status_and_expiry', (q) => q.eq('status', status))
      .paginate(clampPageSize(paginationOpts));
    return {
      ...result,
      page: result.page.map((c) => ({
        _id: c._id,
        email: c.email,
        locale: c.locale ?? null,
        source: c.source,
        importBatch: c.importBatch ?? null,
        confirmSends: c.confirmSends,
        confirmError: c.confirmError ?? null,
        createdAt: c.createdAt,
      })),
    };
  },
});

// --- The one confirmation message, sent in waves --------------------------------------------
//
// Same cadence as every campaign (`deliveryConfig`: batch size and rate set on
// the deployment, read on every wave), so a list of thousands does not leave
// all at once and a new sender's reputation is not burned by a spike.

export const sendConfirmations = mutation({
  args: {},
  returns: v.object({ queued: v.number() }),
  handler: async (ctx) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    if (emailProviderStatus().mode === 'none') {
      throw new ConvexError('EMAIL_PROVIDER_NOT_CONFIGURED');
    }
    // A message that does not say who writes and where is not sent to real
    // people. A simulated development send is fine.
    if (
      senderIdentity().placeholder &&
      emailProviderStatus().mode !== 'simulated'
    ) {
      throw new ConvexError('SENDER_IDENTITY_MISSING');
    }
    const toAsk = await ctx.db
      .query('cercleContacts')
      .withIndex('by_status_and_toAsk', (q) =>
        q.eq('status', 'pending').eq('toAsk', true),
      )
      .first();
    if (!toAsk) return { queued: 0 };
    await ctx.scheduler.runAfter(
      0,
      internal.cercleMailing._confirmationWave,
      {},
    );
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.CERCLE_CONFIRMATIONS_SENT,
    });
    return { queued: 1 };
  },
});

const waveRecipientValidator = v.object({
  contactId: v.id('cercleContacts'),
  email: v.string(),
  locale: v.optional(locale),
  token: v.string(),
  unsubToken: v.string(),
});

// Claims the next wave: arms a fresh single-use token for each contact that
// still has to be asked, and counts the send. Contacts whose message FAILED to
// go (provider down) come back here, within the bound `CERCLE_CONFIRM_MAX_SENDS`.
export const _armWave = internalMutation({
  args: { size: v.number() },
  returns: v.object({
    recipients: v.array(waveRecipientValidator),
    // Today's sending quota is spent: come back then.
    retryInMs: v.optional(v.number()),
  }),
  handler: async (ctx, { size: asked }) => {
    const now = Date.now();
    // The sending service's daily quota (EMAIL_DAILY_LIMIT) bounds the wave.
    const remaining = await dailyRemaining(
      ctx,
      deliveryConfig().dailyLimit,
      now,
    );
    if (remaining === 0)
      return { recipients: [], retryInMs: msUntilNextUtcDay(now) };
    const size = remaining === undefined ? asked : Math.min(asked, remaining);
    const candidates = await ctx.db
      .query('cercleContacts')
      .withIndex('by_status_and_toAsk', (q) =>
        q.eq('status', 'pending').eq('toAsk', true),
      )
      .take(size * 2);
    const out: {
      contactId: Id<'cercleContacts'>;
      email: string;
      locale?: SiteLocale;
      token: string;
      unsubToken: string;
    }[] = [];
    for (const c of candidates) {
      if (out.length >= size) break;
      if (!needsConfirmationSend(c)) continue;
      const token = newConfirmToken();
      await ctx.db.patch(c._id, {
        confirmTokenHash: await hashToken(token),
        confirmExpiresAt: now + CERCLE_CONFIRM_TTL_MS,
        confirmSends: c.confirmSends + 1,
        confirmLastSentAt: now,
        confirmError: undefined,
        // Taken: not asked again unless the send turns out to have failed.
        toAsk: false,
      });
      out.push({
        contactId: c._id,
        email: c.email,
        ...(c.locale ? { locale: c.locale } : {}),
        token,
        unsubToken: c.unsubToken,
      });
    }
    return { recipients: out };
  },
});

export const _recordConfirmationResults = internalMutation({
  args: {
    failures: v.array(
      v.object({ contactId: v.id('cercleContacts'), error: v.string() }),
    ),
    // Messages of the wave that went out: they count against the daily quota.
    sent: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { failures, sent }) => {
    await addSent(ctx, sent);
    for (const f of failures) {
      const c = await ctx.db.get(f.contactId);
      if (!c || c.status !== 'pending') continue;
      await ctx.db.patch(f.contactId, {
        confirmError: f.error.slice(0, 300),
        // Asked again, within the bound.
        toAsk: c.confirmSends < CERCLE_CONFIRM_MAX_SENDS,
      });
    }
    return null;
  },
});

export const _confirmationWave = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const config = deliveryConfig();
    const armed = await ctx.runMutation(internal.cercleMailing._armWave, {
      size: config.batchSize,
    });
    const wave = armed.recipients;
    if (wave.length === 0) {
      // Nobody left — or today's quota is spent: come back after midnight.
      if (armed.retryInMs !== undefined) {
        await ctx.scheduler.runAfter(
          armed.retryInMs,
          internal.cercleMailing._confirmationWave,
          {},
        );
      }
      return null;
    }
    const sender = senderIdentity();
    const mails = wave.map((r) =>
      cercleConfirmationEmail({
        token: r.token,
        unsubToken: r.unsubToken,
        locale: r.locale ?? 'fr',
        sender,
      }),
    );
    const messages = wave.map((r, i) => ({
      to: r.email,
      subject: mails[i].subject,
      html: mails[i].html,
    }));
    try {
      const results = await sendEmailBatch(
        messages,
        // One key per wave and per arming: a retried call within the same wave
        // is recognised by the provider, a later wave is a new send.
        idempotencyKey(
          `cercle-confirm:${wave[0].contactId}:${wave[0].token.slice(0, 8)}`,
        ),
      );
      const failures = wave.flatMap((r, i) =>
        results[i].ok
          ? []
          : [{ contactId: r.contactId, error: results[i].error }],
      );
      await ctx.runMutation(internal.cercleMailing._recordConfirmationResults, {
        failures,
        sent: wave.length - failures.length,
      });
      // DEV/TEST only: the link "sent" is readable by the E2E from the
      // development outbox, like the newsletter's confirmation link.
      if (process.env.AUTH_DEV_OTP === 'true') {
        for (let i = 0; i < wave.length; i++) {
          if (!results[i].ok) continue;
          await ctx.runMutation(internal.cercleMailing._devRecordOutbox, {
            to: wave[i].email,
            subject: mails[i].subject,
            link: mails[i].url,
          });
        }
      }
    } catch (err) {
      const error = (err instanceof Error ? err.message : String(err)).slice(
        0,
        300,
      );
      await ctx.runMutation(internal.cercleMailing._recordConfirmationResults, {
        failures: wave.map((r) => ({ contactId: r.contactId, error })),
        sent: 0,
      });
      // A transient failure backs off; the contacts stay askable (their send is
      // counted, bounded by the maximum).
      await ctx.scheduler.runAfter(
        err instanceof TransientEmailError
          ? Math.min(10 * 60 * 1000, config.intervalMs * 4)
          : config.intervalMs,
        internal.cercleMailing._confirmationWave,
        {},
      );
      return null;
    }
    await ctx.scheduler.runAfter(
      config.intervalMs,
      internal.cercleMailing._confirmationWave,
      {},
    );
    return null;
  },
});

// --- The person's answers ----------------------------------------------------------------------

export const confirm = mutation({
  args: { token: v.string() },
  returns: v.object({
    status: v.union(
      v.literal('confirmed'),
      v.literal('expired'),
      v.literal('invalid'),
    ),
    locale: v.union(locale, v.null()),
  }),
  handler: async (ctx, { token }) => {
    const clean = token.trim().toLowerCase();
    if (!isTokenShaped(clean))
      return { status: 'invalid' as const, locale: null };
    const hash = await hashToken(clean);
    const contact = await ctx.db
      .query('cercleContacts')
      .withIndex('by_confirm_hash', (q) => q.eq('confirmTokenHash', hash))
      .unique();
    if (!contact || contact.status !== 'pending') {
      return { status: 'invalid' as const, locale: null };
    }
    const now = Date.now();
    if (
      contact.confirmExpiresAt !== undefined &&
      contact.confirmExpiresAt < now
    ) {
      return { status: 'expired' as const, locale: contact.locale ?? null };
    }
    await ctx.db.patch(contact._id, {
      status: 'confirmed',
      confirmedAt: now,
      confirmTokenHash: undefined,
      confirmExpiresAt: undefined,
      confirmError: undefined,
      consent: {
        at: now,
        via: 'confirmation_link' as const,
        textVersion: CERCLE_MAILING_TEXT_VERSION,
      },
    });
    return { status: 'confirmed' as const, locale: contact.locale ?? null };
  },
});

async function unsubscribeImpl(
  ctx: { db: import('./_generated/server').MutationCtx['db'] },
  token: string,
): Promise<{ ok: boolean; found: boolean }> {
  if (!/^[0-9a-f]{32}$/.test(token)) return { ok: false, found: false };
  const contact = await ctx.db
    .query('cercleContacts')
    .withIndex('by_token', (q) => q.eq('unsubToken', token))
    .unique();
  if (!contact) return { ok: true, found: false };
  // A suppression entry, not a deletion: a re-import must never write to
  // someone who said no. Whatever a pending confirmation held is dropped.
  await ctx.db.patch(contact._id, {
    status: 'unsubscribed',
    unsubscribedAt: Date.now(),
    confirmTokenHash: undefined,
    confirmExpiresAt: undefined,
  });
  return { ok: true, found: true };
}

export const unsubscribe = mutation({
  args: { token: v.string() },
  returns: v.object({ ok: v.boolean(), found: v.boolean() }),
  handler: (ctx, { token }) => unsubscribeImpl(ctx, token),
});

// "One-click" (RFC 8058) — called by `POST /cercle/unsubscribe`.
export const unsubscribeByToken = internalMutation({
  args: { token: v.string() },
  returns: v.object({ ok: v.boolean(), found: v.boolean() }),
  handler: (ctx, { token }) => unsubscribeImpl(ctx, token),
});

// A contact who never answered is not kept past its deadline (minimization):
// the row goes. An UNSUBSCRIBED row stays — it is the suppression entry.
const PURGE_BATCH = 200;
export const purgeExpiredPending = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const expired = await ctx.db
      .query('cercleContacts')
      .withIndex('by_status_and_expiry', (q) =>
        q.eq('status', 'pending').lt('confirmExpiresAt', Date.now()),
      )
      .take(PURGE_BATCH);
    for (const c of expired) await ctx.db.delete(c._id);
    if (expired.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.cercleMailing.purgeExpiredPending,
        {},
      );
    }
    return { deleted: expired.length };
  },
});

// --- DEV/TEST only (AUTH_DEV_OTP guard) ---------------------------------------------------
//
// Internal functions, outside the public API, called by the Convex CLI in a
// trusted context: the E2E reads the "sent" confirmation link and a contact's
// state, exactly as it reads sign-in codes and the newsletter's links.

export const _devRecordOutbox = internalMutation({
  args: { to: v.string(), subject: v.string(), link: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    await ctx.db.insert('devOutbox', {
      to: args.to,
      kind: 'cercle-confirmation',
      subject: args.subject,
      link: args.link,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const devLatestConfirmationLink = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const rows = await ctx.db
      .query('devOutbox')
      .withIndex('by_to', (q) => q.eq('to', email.trim().toLowerCase()))
      .order('desc')
      .take(10);
    return rows.find((r) => r.kind === 'cercle-confirmation')?.link ?? null;
  },
});

export const devContact = internalQuery({
  args: { email: v.string() },
  returns: v.union(
    v.null(),
    v.object({ status: contactStatus, unsubToken: v.string() }),
  ),
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const c = await ctx.db
      .query('cercleContacts')
      .withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
      .unique();
    return c ? { status: c.status, unsubToken: c.unsubToken } : null;
  },
});

// DEV/TEST only (AUTH_DEV_OTP guard): puts addresses on the list as confirmed,
// so an E2E can send a campaign to a known number of people without going
// through requests and confirmations.
export const _devSeedConfirmed = internalMutation({
  args: { emails: v.array(v.string()) },
  returns: v.number(),
  handler: async (ctx, { emails }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return 0;
    const now = Date.now();
    let added = 0;
    for (const raw of emails) {
      const email = raw.trim().toLowerCase();
      const existing = await ctx.db
        .query('cercleContacts')
        .withIndex('by_email', (q) => q.eq('email', email))
        .unique();
      if (existing) continue;
      await ctx.db.insert('cercleContacts', {
        email,
        status: 'confirmed',
        source: 'request',
        unsubToken: newUnsubToken(),
        confirmSends: 0,
        confirmedAt: now,
        createdAt: now,
      });
      added++;
    }
    return added;
  },
});

import { ConvexError, v } from 'convex/values';
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  getAccessState,
  requireNetworkRole,
  requireUser,
  effectiveRole,
} from './lib/rbac';
import { networkRole } from './schema';
import { locale, type SiteLocale } from './lib/locales';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { COUNTER, bumpCounter } from './lib/counters';
import { isEmail } from './lib/validation';
import { normalizeEmail } from './lib/onboarding';
import { enforceRateLimit } from './lib/rateLimit';
import { emailProviderStatus, sendEmail } from './email';
import {
  accountDeletionCodeEmail,
  accountWelcomeEmail,
} from './lib/accountEmails';
import {
  advanceDeletion,
  collectUserData,
  deleteUserRow,
  invalidateAllSessions,
} from './lib/accountDeletion';
import { sha256Hex } from './lib/totp';

// ACCOUNT LIFECYCLE (accounts workstream, F-63) — direct creation,
// suspension, reactivation, deletion (by an administrator or by the
// holder), data export. The back office could only invite.
//
// All administration writes are audited (F-67); refusals
// carry a CODE, translated by the UI (admin.feedbackErr_<CODE>).

const orgRoleValidator = v.union(v.literal('owner'), v.literal('member'));

const emailModeValidator = v.union(
  v.literal('configured'),
  v.literal('simulated'),
  v.literal('none'),
);

// --- Shared guards -----------------------------------------------------------

/**
 * NEVER THE LAST ADMINISTRATOR — same rule as bootstrapping
 * (convex/bootstrap.ts) and as `users.setRole`. A SUSPENDED administrator does not
 * count: they can no longer reassign anything, it would be a lockout.
 */
export async function assertNotLastActiveAdmin(
  ctx: MutationCtx,
  target: Doc<'users'>,
): Promise<void> {
  if (target.role !== 'admin' || target.suspendedAt !== undefined) return;
  const admins = await ctx.db
    .query('users')
    .withIndex('by_role', (q) => q.eq('role', 'admin'))
    .take(100);
  const active = admins.filter(
    (a) => a.suspendedAt === undefined && a._id !== target._id,
  );
  if (active.length === 0) throw new ConvexError('LAST_ADMIN');
}

async function requireTarget(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'users'>> {
  const target = await ctx.db.get(userId);
  if (!target) throw new ConvexError('NOT_FOUND');
  return target;
}

// --- Session state (UI guard) ------------------------------------------------

// The UI needs to know WHY an authenticated session gets
// nothing: suspended (message and sign-out), second factor pending (code
// entry screen), mandatory 2FA enrollment (security screen). This
// query gives access to no data: only the state.
export const sessionState = query({
  args: {},
  returns: v.object({
    state: v.union(
      v.literal('anonymous'),
      v.literal('active'),
      v.literal('suspended'),
      // Deletion in progress (the account is suspended while processing runs):
      // the screen must not talk about suspension to someone who has just deleted
      // their own account.
      v.literal('deleting'),
      v.literal('second_factor_required'),
      v.literal('enrollment_required'),
    ),
  }),
  handler: async (ctx) => {
    const access = await getAccessState(ctx);
    if (!access) return { state: 'anonymous' as const };
    if (
      access.state === 'suspended' &&
      access.user.suspensionReason === 'deletion'
    ) {
      return { state: 'deleting' as const };
    }
    return { state: access.state };
  },
});

// --- Direct creation ---------------------------------------------------------

// Opens an account on someone's behalf (secretariat, moderator, member of an
// organization). An existing account is NEVER demoted or modified: we
// resend the welcome email (unless the account is suspended) and, if an organization
// is chosen, we attach it to it.
export const createAccount = mutation({
  args: {
    email: v.string(),
    role: networkRole,
    organizationId: v.optional(v.id('organizations')),
    orgRole: v.optional(orgRoleValidator),
    locale: v.optional(locale),
  },
  returns: v.object({
    created: v.boolean(),
    userId: v.id('users'),
    emailMode: emailModeValidator,
  }),
  handler: async (ctx, args) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    const email = normalizeEmail(args.email);
    if (!isEmail(email)) throw new ConvexError('INVALID_EMAIL');

    const org = args.organizationId
      ? await ctx.db.get(args.organizationId)
      : null;
    if (args.organizationId && !org) throw new ConvexError('NOT_FOUND');

    const existing = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .first();

    let userId: Id<'users'>;
    let created = false;
    if (existing) {
      userId = existing._id;
    } else {
      userId = await ctx.db.insert('users', {
        email,
        role: args.role,
        ...(args.locale ? { preferredLocale: args.locale } : {}),
      });
      await bumpCounter(ctx, COUNTER.USERS, 1);
      created = true;
      await recordAudit(ctx, {
        actorId: admin._id,
        action: AUDIT.USER_CREATED,
        targetId: userId,
        metadata: { role: args.role, via: 'admin', organizationId: org?._id },
      });
    }

    if (org) {
      const already = await ctx.db
        .query('organizationMemberships')
        .withIndex('by_org_user', (q) =>
          q.eq('orgId', org._id).eq('userId', userId),
        )
        .first();
      if (!already) {
        const orgRole = args.orgRole ?? 'member';
        await ctx.db.insert('organizationMemberships', {
          userId,
          orgId: org._id,
          orgRole,
          createdAt: Date.now(),
        });
        await recordAudit(ctx, {
          actorId: admin._id,
          action: AUDIT.ORG_MEMBER_ADDED,
          targetId: org._id,
          metadata: { userId, orgRole, via: 'admin' },
        });
      }
    }

    if (!existing || existing.suspendedAt === undefined) {
      await ctx.scheduler.runAfter(0, internal.accounts.sendWelcomeEmail, {
        email,
        locale: args.locale ?? existing?.preferredLocale ?? 'fr',
        ...(org ? { organizationName: org.name } : {}),
      });
    }
    return { created, userId, emailMode: emailProviderStatus().mode };
  },
});

// Sending happens in an ACTION (network forbidden in a mutation). A send failure does
// not call the account into question: it exists, and the email is resent by recreating
// the account (idempotent) from the back office.
export const sendWelcomeEmail = internalAction({
  args: {
    email: v.string(),
    locale,
    organizationName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (_ctx, { email, locale: loc, organizationName }) => {
    // .test addresses (RFC 6761, E2E) never receive a real
    // email, even with a configured provider — same rule as the OTP.
    const hasProvider =
      !!process.env.AUTH_RESEND_KEY || !!process.env.AUTH_EMAIL_PROVIDER;
    if (hasProvider && email.endsWith('.test')) return null;
    const { subject, html } = accountWelcomeEmail({
      siteUrl: process.env.SITE_URL ?? 'http://localhost:3000',
      locale: loc,
      organizationName,
    });
    await sendEmail({ to: email, subject, html });
    return null;
  },
});

// --- Suspension / reactivation ----------------------------------------------

export const SUSPENSION_REASON_MIN = 3;
export const SUSPENSION_REASON_MAX = 500;

export const suspendAccount = mutation({
  args: { userId: v.id('users'), reason: v.string() },
  returns: v.object({ sessionsRevoked: v.number() }),
  handler: async (ctx, { userId, reason }) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    const motif = reason.trim();
    // MANDATORY reason: a suspension with no written reason cannot be justified
    // to the person, nor before the board, nor to the next
    // administrator who wants to lift it.
    if (
      motif.length < SUSPENSION_REASON_MIN ||
      motif.length > SUSPENSION_REASON_MAX
    ) {
      throw new ConvexError('INVALID_REASON');
    }
    if (userId === admin._id) throw new ConvexError('SELF_ACTION');
    const target = await requireTarget(ctx, userId);
    if (target.suspendedAt !== undefined) {
      throw new ConvexError('ALREADY_SUSPENDED');
    }
    await assertNotLastActiveAdmin(ctx, target);

    await ctx.db.patch(userId, {
      suspendedAt: Date.now(),
      suspensionReason: motif,
      suspendedBy: admin._id,
    });
    // Open sessions are DELETED, refresh tokens
    // included: the current access token (1 h at most) no longer opens anything,
    // since every guard reads the suspension, and it cannot be
    // renewed.
    const sessionsRevoked = await invalidateAllSessions(ctx, userId);
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.USER_SUSPENDED,
      targetId: userId,
      metadata: { reason: motif, sessionsRevoked },
    });
    return { sessionsRevoked };
  },
});

export const reactivateAccount = mutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    const target = await requireTarget(ctx, userId);
    if (target.suspendedAt === undefined) {
      throw new ConvexError('NOT_SUSPENDED');
    }
    // An account being DELETED also carries a suspension: it cannot
    // be lifted, deletion is irreversible.
    const deletion = await ctx.db
      .query('accountDeletions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (deletion) throw new ConvexError('DELETION_IN_PROGRESS');
    await ctx.db.patch(userId, {
      suspendedAt: undefined,
      suspensionReason: undefined,
      suspendedBy: undefined,
    });
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.USER_REACTIVATED,
      targetId: userId,
    });
    return null;
  },
});

// --- Deletion ----------------------------------------------------------------

/**
 * Starts the deletion of an account. The account is immediately SUSPENDED (no
 * more access, no more sign-in) and its sessions deleted; the
 * processing continues in batches in `runAccountDeletion`.
 */
async function startDeletion(
  ctx: MutationCtx,
  target: Doc<'users'>,
  via: 'admin' | 'self',
  requestedBy: Id<'users'> | undefined,
): Promise<Id<'accountDeletions'>> {
  await assertNotLastActiveAdmin(ctx, target);
  const already = await ctx.db
    .query('accountDeletions')
    .withIndex('by_user', (q) => q.eq('userId', target._id))
    .first();
  if (already) throw new ConvexError('DELETION_IN_PROGRESS');

  await ctx.db.patch(target._id, {
    suspendedAt: target.suspendedAt ?? Date.now(),
    suspensionReason: 'deletion',
  });
  await invalidateAllSessions(ctx, target._id);
  const deletionId = await ctx.db.insert('accountDeletions', {
    userId: target._id,
    via,
    ...(requestedBy ? { requestedBy } : {}),
    status: 'running',
    step: 0,
    ...(target.email ? { email: target.email } : {}),
    startedAt: Date.now(),
  });
  await recordAudit(ctx, {
    actorId: requestedBy,
    action: AUDIT.USER_DELETION_STARTED,
    targetId: target._id,
    metadata: { via },
  });
  await ctx.scheduler.runAfter(0, internal.accounts.runAccountDeletion, {
    deletionId,
  });
  return deletionId;
}

// Deletion by an administrator — TWO-STEP CONFIRMATION: the screen
// first asks for confirmation, then to RETYPE the account's address. The
// server requires this address: a direct API call without it fails,
// the step is not just a UI effect.
export const deleteAccount = mutation({
  args: { userId: v.id('users'), confirmEmail: v.string() },
  returns: v.object({ deletionId: v.id('accountDeletions') }),
  handler: async (ctx, { userId, confirmEmail }) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    if (userId === admin._id) throw new ConvexError('SELF_ACTION');
    const target = await requireTarget(ctx, userId);
    if (
      !target.email ||
      normalizeEmail(confirmEmail) !== normalizeEmail(target.email)
    ) {
      throw new ConvexError('CONFIRMATION_MISMATCH');
    }
    const deletionId = await startDeletion(ctx, target, 'admin', admin._id);
    return { deletionId };
  },
});

export const runAccountDeletion = internalMutation({
  args: { deletionId: v.id('accountDeletions') },
  returns: v.null(),
  handler: async (ctx, { deletionId }) => {
    const job = await ctx.db.get(deletionId);
    if (!job || job.status === 'done') return null;
    const { step, done } = await advanceDeletion(ctx, job.userId, job.step, {
      email: job.email ?? null,
    });
    if (!done) {
      await ctx.db.patch(deletionId, { step });
      await ctx.scheduler.runAfter(0, internal.accounts.runAccountDeletion, {
        deletionId,
      });
      return null;
    }
    await deleteUserRow(ctx, job.userId);
    // The address was only needed for processing: it goes with it.
    await ctx.db.patch(deletionId, {
      status: 'done',
      step,
      email: undefined,
      completedAt: Date.now(),
    });
    await recordAudit(ctx, {
      actorId: job.requestedBy,
      action: AUDIT.USER_DELETED,
      targetId: job.userId,
      metadata: { via: job.via },
    });
    return null;
  },
});

// --- Self-service: export and deletion of ONE'S OWN data ---------------------

const exportValidator = v.object({
  account: v.object({
    email: v.union(v.string(), v.null()),
    name: v.union(v.string(), v.null()),
    role: networkRole,
    preferredLocale: v.union(locale, v.null()),
    createdAt: v.number(),
    emailVerifiedAt: v.union(v.number(), v.null()),
  }),
  data: v.record(v.string(), v.any()),
});

// Right of access and to portability (GDPR arts. 15 and 20) — a gap raised by
// the audit. The file contains ONLY what relates to the calling account:
// each registry module reads by the account's identifier (or its address),
// never by a client argument. No 2FA secret, no password
// hash. The export date is set by the client: a query does not read
// the clock (Convex guidelines).
export const exportMyData = query({
  args: {},
  returns: exportValidator,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const email = user.email ?? null;
    return {
      account: {
        email,
        name: user.name ?? null,
        role: effectiveRole(user.role),
        preferredLocale: user.preferredLocale ?? null,
        createdAt: user._creationTime,
        emailVerifiedAt: user.emailVerificationTime ?? null,
      },
      data: await collectUserData(ctx, user._id, { email }),
    };
  },
});

// Calling account, for an ACTION (which has no database): the action's identity
// is propagated to this query, the guards apply in full.
export const selfForAction = internalQuery({
  args: {},
  returns: v.object({
    userId: v.id('users'),
    email: v.union(v.string(), v.null()),
    locale: locale,
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return {
      userId: user._id,
      email: user.email ?? null,
      locale: user.preferredLocale ?? 'fr',
    };
  },
});

const DELETION_CODE_TTL_MS = 15 * 60 * 1000;
const DELETION_CODE_MAX_ATTEMPTS = 5;

export const storeDeletionCode = internalMutation({
  args: {
    codeHash: v.string(),
    devCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { codeHash, devCode }) => {
    const user = await requireUser(ctx);
    // Anti-abuse: each request sends an email.
    await enforceRateLimit(ctx, {
      key: `deleteCode:${user._id}`,
      max: 5,
      windowMs: 60 * 60 * 1000,
    });
    const previous = await ctx.db
      .query('accountConfirmationCodes')
      .withIndex('by_user_and_purpose', (q) =>
        q.eq('userId', user._id).eq('purpose', 'delete_account'),
      )
      .take(10);
    for (const p of previous) await ctx.db.delete(p._id);
    const now = Date.now();
    await ctx.db.insert('accountConfirmationCodes', {
      userId: user._id,
      purpose: 'delete_account',
      codeHash,
      expiresAt: now + DELETION_CODE_TTL_MS,
      attempts: 0,
      createdAt: now,
    });
    // DEV/TEST (AUTH_DEV_OTP): the plaintext code, read back by the E2E spec via
    // the existing oracle (`otp:latestDevCode`). Never in production.
    if (devCode && process.env.AUTH_DEV_OTP === 'true' && user.email) {
      await ctx.db.insert('devOtpCodes', {
        email: user.email,
        code: devCode,
        purpose: 'account-deletion',
        createdAt: now,
      });
    }
    return null;
  },
});

function randomSixDigits(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] % 1_000_000).toString().padStart(6, '0');
}

// Step 1 of self-service deletion: a code is sent to
// the account's address. A stolen session (a computer left logged in) is therefore not
// enough to erase an account: you also need the mailbox.
export const requestAccountDeletion = action({
  args: {},
  returns: v.object({ emailMode: emailModeValidator }),
  handler: async (
    ctx,
  ): Promise<{ emailMode: 'configured' | 'simulated' | 'none' }> => {
    const self: {
      userId: Id<'users'>;
      email: string | null;
      locale: SiteLocale;
    } = await ctx.runQuery(internal.accounts.selfForAction, {});
    if (!self.email) throw new ConvexError('NO_EMAIL');
    const mode = emailProviderStatus().mode;
    // Refuse BEFORE creating a code: without a provider (and outside dev), the code
    // would never go out and the screen would wait in vain.
    if (mode === 'none') throw new ConvexError('EMAIL_PROVIDER_NOT_CONFIGURED');
    const code = randomSixDigits();
    await ctx.runMutation(internal.accounts.storeDeletionCode, {
      codeHash: await sha256Hex(`${self.userId}:${code}`),
      devCode: process.env.AUTH_DEV_OTP === 'true' ? code : undefined,
    });
    const hasProvider = mode === 'configured';
    if (!(hasProvider && self.email.endsWith('.test'))) {
      const { subject, html } = accountDeletionCodeEmail({
        code,
        locale: self.locale,
      });
      await sendEmail({ to: self.email, subject, html });
    }
    return { emailMode: mode };
  },
});

const confirmResultValidator = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({
    ok: v.literal(false),
    reason: v.union(
      v.literal('NO_REQUEST'),
      v.literal('EXPIRED'),
      v.literal('INVALID_CODE'),
      v.literal('TOO_MANY_ATTEMPTS'),
    ),
  }),
);

type ConfirmResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'NO_REQUEST' | 'EXPIRED' | 'INVALID_CODE' | 'TOO_MANY_ATTEMPTS';
    };

// Returns a RESULT instead of throwing on a wrong code: an exception
// would roll back the transaction, and with it the attempt count.
export const consumeDeletionCode = internalMutation({
  args: { codeHash: v.string() },
  returns: confirmResultValidator,
  handler: async (ctx, { codeHash }): Promise<ConfirmResult> => {
    const user = await requireUser(ctx);
    const row = await ctx.db
      .query('accountConfirmationCodes')
      .withIndex('by_user_and_purpose', (q) =>
        q.eq('userId', user._id).eq('purpose', 'delete_account'),
      )
      .first();
    if (!row) return { ok: false, reason: 'NO_REQUEST' };
    if (row.expiresAt < Date.now()) {
      await ctx.db.delete(row._id);
      return { ok: false, reason: 'EXPIRED' };
    }
    if (row.codeHash !== codeHash) {
      if (row.attempts + 1 >= DELETION_CODE_MAX_ATTEMPTS) {
        await ctx.db.delete(row._id);
        return { ok: false, reason: 'TOO_MANY_ATTEMPTS' };
      }
      await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
      return { ok: false, reason: 'INVALID_CODE' };
    }
    await ctx.db.delete(row._id);
    // The last administrator cannot erase themselves: throws
    // LAST_ADMIN, which the screen translates.
    await startDeletion(ctx, user, 'self', user._id);
    return { ok: true };
  },
});

export const confirmAccountDeletion = action({
  args: { code: v.string() },
  returns: confirmResultValidator,
  handler: async (ctx, { code }): Promise<ConfirmResult> => {
    const digits = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(digits)) return { ok: false, reason: 'INVALID_CODE' };
    const self: { userId: Id<'users'> } = await ctx.runQuery(
      internal.accounts.selfForAction,
      {},
    );
    return await ctx.runMutation(internal.accounts.consumeDeletionCode, {
      codeHash: await sha256Hex(`${self.userId}:${digits}`),
    });
  },
});

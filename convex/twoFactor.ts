import { ConvexError, v } from 'convex/values';
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { requireNetworkRole, requireSessionUser } from './lib/rbac';
import {
  currentSessionId,
  readSecurityPolicy,
  roleRequiresTwoFactor,
} from './lib/accountAccess';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { enforceRateLimit } from './lib/rateLimit';
import { normalizeEmail } from './lib/onboarding';
import {
  TOTP_SECRET_BYTES,
  backupCodesFromBytes,
  BACKUP_RANDOM_BYTES,
  base32Encode,
  matchTotpStep,
  normalizeBackupCode,
  normalizeTotpCode,
  otpauthUri,
  sha256Hex,
} from './lib/totp';
import { openSecret, sealSecret, secretKeyStatus } from './lib/secretBox';

// TWO-FACTOR AUTHENTICATION (TOTP, RFC 6238) — accounts workstream.
//
// DIVISION OF LABOR. Cryptography (secret generation, encryption,
// HMAC-SHA1, hashes) happens in ACTIONS: Web Crypto and non-deterministic
// randomness are guaranteed there. Decisions that must be ATOMIC
// — "this time step has never been used", "this backup code has never
// been used", "the proof is attached to THIS session" — are made in
// internal mutations, serialized by Convex: two simultaneous submissions of the same
// code do not both succeed.
//
// THE PROOF IS BOUND TO THE SESSION (`getAuthSessionId`). Once 2FA is
// active, a new sign-in opens a session without proof, and all the
// guards (convex/lib/rbac.ts) reject it until the code is entered.

const ISSUER = 'Democracy Together';

// Code attempts per account: 6 per quarter hour. With a window of three
// valid codes out of a million, that is ~0.17% chance per day for an
// attacker who ALREADY has the password — the role of a second factor.
const VERIFY_LIMIT = { max: 6, windowMs: 15 * 60 * 1000 };

type Factor = { step: number } | { backupHash: string };

const factorValidator = v.union(
  v.object({ step: v.number() }),
  v.object({ backupHash: v.string() }),
);

const verifyReason = v.union(
  v.literal('INVALID_CODE'),
  v.literal('REPLAYED'),
  v.literal('NOT_ENABLED'),
);

type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'INVALID_CODE' | 'REPLAYED' | 'NOT_ENABLED' };

const verifyResultValidator = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({ ok: v.literal(false), reason: verifyReason }),
);

async function credentialOf(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'twoFactorCredentials'> | null> {
  return await ctx.db
    .query('twoFactorCredentials')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
}

/**
 * Consumes a factor ATOMICALLY: a time step strictly
 * later than the last accepted one, or a still-unused backup code.
 */
async function consumeFactor(
  ctx: MutationCtx,
  cred: Doc<'twoFactorCredentials'>,
  factor: Factor,
): Promise<VerifyResult & { method?: 'totp' | 'backup' }> {
  if ('step' in factor) {
    if (cred.lastUsedStep !== undefined && factor.step <= cred.lastUsedStep) {
      return { ok: false, reason: 'REPLAYED' };
    }
    await ctx.db.patch(cred._id, { lastUsedStep: factor.step });
    return { ok: true, method: 'totp' };
  }
  const index = cred.backupCodes.findIndex(
    (b) => b.hash === factor.backupHash && b.usedAt === undefined,
  );
  if (index === -1) return { ok: false, reason: 'INVALID_CODE' };
  const backupCodes = cred.backupCodes.map((b, i) =>
    i === index ? { ...b, usedAt: Date.now() } : b,
  );
  await ctx.db.patch(cred._id, { backupCodes });
  return { ok: true, method: 'backup' };
}

async function recordProof(
  ctx: MutationCtx,
  userId: Id<'users'>,
  method: 'totp' | 'backup',
) {
  const sessionId = await currentSessionId(ctx);
  if (!sessionId) throw new ConvexError('NO_SESSION');
  const existing = await ctx.db
    .query('twoFactorSessionProofs')
    .withIndex('by_session', (q) => q.eq('sessionId', sessionId))
    .first();
  if (!existing) {
    await ctx.db.insert('twoFactorSessionProofs', {
      sessionId,
      userId,
      method,
      verifiedAt: Date.now(),
    });
  }
  // Cleanup: proofs of sessions closed since (sign-out, expiry)
  // are no longer of any use.
  const older = await ctx.db
    .query('twoFactorSessionProofs')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(20);
  for (const proof of older) {
    if (proof.sessionId !== sessionId && !(await ctx.db.get(proof.sessionId))) {
      await ctx.db.delete(proof._id);
    }
  }
}

async function removeCredential(ctx: MutationCtx, userId: Id<'users'>) {
  const cred = await credentialOf(ctx, userId);
  if (cred) await ctx.db.delete(cred._id);
  const proofs = await ctx.db
    .query('twoFactorSessionProofs')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(200);
  for (const proof of proofs) await ctx.db.delete(proof._id);
}

// --- Reading -----------------------------------------------------------------

export const status = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    pending: v.boolean(),
    backupCodesRemaining: v.number(),
    // 2FA is MANDATORY for this account (setting + role).
    required: v.boolean(),
    // This session has presented its second factor.
    sessionVerified: v.boolean(),
    keyStatus: v.union(
      v.literal('configured'),
      v.literal('dev'),
      v.literal('none'),
    ),
  }),
  handler: async (ctx) => {
    const { user, state } = await requireSessionUser(ctx);
    const cred = await ctx.db
      .query('twoFactorCredentials')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .unique();
    const policy = await readSecurityPolicy(ctx);
    const enabled = cred?.status === 'active';
    return {
      enabled,
      pending: cred?.status === 'pending',
      backupCodesRemaining: enabled
        ? cred.backupCodes.filter((b) => b.usedAt === undefined).length
        : 0,
      required:
        policy.twoFactorRequiredForStaff && roleRequiresTwoFactor(user.role),
      sessionVerified: enabled && state === 'active',
      keyStatus: secretKeyStatus(),
    };
  },
});

// Context of an action: account, encrypted secret, last step used.
export const loadForAction = internalQuery({
  args: {},
  returns: v.object({
    userId: v.id('users'),
    email: v.union(v.string(), v.null()),
    credential: v.union(
      v.null(),
      v.object({
        status: v.union(v.literal('pending'), v.literal('active')),
        ciphertext: v.string(),
        iv: v.string(),
        keyId: v.union(v.literal('env'), v.literal('dev')),
        lastUsedStep: v.union(v.number(), v.null()),
      }),
    ),
  }),
  handler: async (ctx) => {
    const { user } = await requireSessionUser(ctx);
    const cred = await ctx.db
      .query('twoFactorCredentials')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .unique();
    return {
      userId: user._id,
      email: user.email ?? null,
      credential: cred
        ? {
            status: cred.status,
            ciphertext: cred.secretCiphertext,
            iv: cred.secretIv,
            keyId: cred.keyId,
            lastUsedStep: cred.lastUsedStep ?? null,
          }
        : null,
    };
  },
});

export const consumeAttempt = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { user } = await requireSessionUser(ctx);
    await enforceRateLimit(ctx, {
      key: `totp:${user._id}`,
      ...VERIFY_LIMIT,
    });
    return null;
  },
});

// --- Device enrollment ----------------------------------------------

export const storePending = internalMutation({
  args: {
    ciphertext: v.string(),
    iv: v.string(),
    keyId: v.union(v.literal('env'), v.literal('dev')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await requireSessionUser(ctx);
    const existing = await credentialOf(ctx, user._id);
    if (existing?.status === 'active') throw new ConvexError('ALREADY_ENABLED');
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert('twoFactorCredentials', {
      userId: user._id,
      status: 'pending',
      secretCiphertext: args.ciphertext,
      secretIv: args.iv,
      keyId: args.keyId,
      backupCodes: [],
      createdAt: Date.now(),
    });
    return null;
  },
});

// Step 1: a FRESH secret, shown only once (QR code + manual entry).
// It becomes active only after a first code is confirmed: a badly
// copied secret locks no one out.
export const beginEnrollment = action({
  args: {},
  returns: v.object({ secret: v.string(), uri: v.string() }),
  handler: async (ctx): Promise<{ secret: string; uri: string }> => {
    const self: {
      userId: Id<'users'>;
      email: string | null;
      credential: { status: 'pending' | 'active' } | null;
    } = await ctx.runQuery(internal.twoFactor.loadForAction, {});
    if (self.credential?.status === 'active') {
      throw new ConvexError('ALREADY_ENABLED');
    }
    if (secretKeyStatus() === 'none') {
      throw new ConvexError('TWO_FACTOR_KEY_NOT_CONFIGURED');
    }
    const secret = crypto.getRandomValues(new Uint8Array(TOTP_SECRET_BYTES));
    const sealed = await sealSecret(secret, self.userId);
    await ctx.runMutation(internal.twoFactor.storePending, {
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      keyId: sealed.keyId,
    });
    const secretBase32 = base32Encode(secret);
    return {
      secret: secretBase32,
      uri: otpauthUri({
        secretBase32,
        account: self.email ?? String(self.userId),
        issuer: ISSUER,
      }),
    };
  },
});

export const activate = internalMutation({
  args: { step: v.number(), backupHashes: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { step, backupHashes }) => {
    const { user } = await requireSessionUser(ctx);
    const cred = await credentialOf(ctx, user._id);
    if (!cred || cred.status !== 'pending') throw new ConvexError('NO_PENDING');
    await ctx.db.patch(cred._id, {
      status: 'active',
      lastUsedStep: step,
      activatedAt: Date.now(),
      backupCodes: backupHashes.map((hash) => ({ hash })),
    });
    // The code just entered COUNTS as proof for the current session:
    // enrolling one's device must not sign one out.
    await recordProof(ctx, user._id, 'totp');
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.TWO_FACTOR_ENABLED,
      targetId: user._id,
    });
    return null;
  },
});

async function freshBackupCodes(): Promise<{
  codes: string[];
  hashes: string[];
}> {
  const codes = backupCodesFromBytes(
    crypto.getRandomValues(new Uint8Array(BACKUP_RANDOM_BYTES)),
  );
  const hashes = await Promise.all(
    codes.map(async (c) => sha256Hex(normalizeBackupCode(c) ?? c)),
  );
  return { codes, hashes };
}

// Step 2: the first code confirms that the device has correctly stored the
// secret. The backup codes are returned IN PLAINTEXT only once; only
// their hashes remain in the database.
export const confirmEnrollment = action({
  args: { code: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), backupCodes: v.array(v.string()) }),
    v.object({ ok: v.literal(false), reason: verifyReason }),
  ),
  handler: async (
    ctx,
    { code },
  ): Promise<
    | { ok: true; backupCodes: string[] }
    | { ok: false; reason: 'INVALID_CODE' | 'REPLAYED' | 'NOT_ENABLED' }
  > => {
    await ctx.runMutation(internal.twoFactor.consumeAttempt, {});
    const self: {
      userId: Id<'users'>;
      credential: {
        status: 'pending' | 'active';
        ciphertext: string;
        iv: string;
        keyId: 'env' | 'dev';
      } | null;
    } = await ctx.runQuery(internal.twoFactor.loadForAction, {});
    if (!self.credential || self.credential.status !== 'pending') {
      return { ok: false, reason: 'NOT_ENABLED' };
    }
    const secret = await openSecret(self.credential, self.userId);
    const step = await matchTotpStep(secret, code, Date.now());
    if (step === null) return { ok: false, reason: 'INVALID_CODE' };
    const { codes, hashes } = await freshBackupCodes();
    await ctx.runMutation(internal.twoFactor.activate, {
      step,
      backupHashes: hashes,
    });
    return { ok: true, backupCodes: codes };
  },
});

// --- Session verification ----------------------------------------------

/** Determines the factor presented: TOTP code (6 digits) or backup code. */
async function resolveFactor(
  input: string,
  credential: {
    ciphertext: string;
    iv: string;
    keyId: 'env' | 'dev';
    lastUsedStep: number | null;
  },
  userId: Id<'users'>,
): Promise<Factor | 'REPLAYED' | null> {
  if (normalizeTotpCode(input) !== null) {
    const secret = await openSecret(credential, userId);
    const now = Date.now();
    const step = await matchTotpStep(secret, input, now, {
      afterStep: credential.lastUsedStep ?? undefined,
    });
    if (step !== null) return { step };
    // Correct, but already used: we say so, the user will wait for the next one.
    const replay = await matchTotpStep(secret, input, now);
    return replay !== null ? 'REPLAYED' : null;
  }
  const backup = normalizeBackupCode(input);
  return backup ? { backupHash: await sha256Hex(backup) } : null;
}

export const recordVerification = internalMutation({
  args: { factor: factorValidator },
  returns: verifyResultValidator,
  handler: async (ctx, { factor }): Promise<VerifyResult> => {
    const { user } = await requireSessionUser(ctx);
    const cred = await credentialOf(ctx, user._id);
    if (!cred || cred.status !== 'active') {
      return { ok: false, reason: 'NOT_ENABLED' };
    }
    const result = await consumeFactor(ctx, cred, factor);
    if (!result.ok) return { ok: false, reason: result.reason };
    await recordProof(ctx, user._id, result.method ?? 'totp');
    return { ok: true };
  },
});

// Code entry after sign-in. Accepts a TOTP code or a backup code.
export const verify = action({
  args: { code: v.string() },
  returns: verifyResultValidator,
  handler: async (ctx, { code }): Promise<VerifyResult> => {
    await ctx.runMutation(internal.twoFactor.consumeAttempt, {});
    const self: {
      userId: Id<'users'>;
      credential: {
        status: 'pending' | 'active';
        ciphertext: string;
        iv: string;
        keyId: 'env' | 'dev';
        lastUsedStep: number | null;
      } | null;
    } = await ctx.runQuery(internal.twoFactor.loadForAction, {});
    if (!self.credential || self.credential.status !== 'active') {
      return { ok: false, reason: 'NOT_ENABLED' };
    }
    const factor = await resolveFactor(code, self.credential, self.userId);
    if (factor === 'REPLAYED') return { ok: false, reason: 'REPLAYED' };
    if (factor === null) return { ok: false, reason: 'INVALID_CODE' };
    return await ctx.runMutation(internal.twoFactor.recordVerification, {
      factor,
    });
  },
});

// --- Deactivation, new backup codes --------------------------------

export const disableAfterVerification = internalMutation({
  args: { factor: factorValidator },
  returns: verifyResultValidator,
  handler: async (ctx, { factor }): Promise<VerifyResult> => {
    const { user, state } = await requireSessionUser(ctx);
    if (state !== 'active') throw new ConvexError('TWO_FACTOR_REQUIRED');
    // Role subject to the requirement: removing one's 2FA would amount to
    // bypassing the administrator's setting.
    const policy = await readSecurityPolicy(ctx);
    if (policy.twoFactorRequiredForStaff && roleRequiresTwoFactor(user.role)) {
      throw new ConvexError('TWO_FACTOR_REQUIRED_BY_POLICY');
    }
    const cred = await credentialOf(ctx, user._id);
    if (!cred || cred.status !== 'active') {
      return { ok: false, reason: 'NOT_ENABLED' };
    }
    const result = await consumeFactor(ctx, cred, factor);
    if (!result.ok) return { ok: false, reason: result.reason };
    await removeCredential(ctx, user._id);
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.TWO_FACTOR_DISABLED,
      targetId: user._id,
    });
    return { ok: true };
  },
});

// Disabling requires a valid code: a session left open is not
// enough to remove the second factor.
export const disable = action({
  args: { code: v.string() },
  returns: verifyResultValidator,
  handler: async (ctx, { code }): Promise<VerifyResult> => {
    await ctx.runMutation(internal.twoFactor.consumeAttempt, {});
    const self: {
      userId: Id<'users'>;
      credential: {
        status: 'pending' | 'active';
        ciphertext: string;
        iv: string;
        keyId: 'env' | 'dev';
        lastUsedStep: number | null;
      } | null;
    } = await ctx.runQuery(internal.twoFactor.loadForAction, {});
    if (!self.credential || self.credential.status !== 'active') {
      return { ok: false, reason: 'NOT_ENABLED' };
    }
    const factor = await resolveFactor(code, self.credential, self.userId);
    if (factor === 'REPLAYED') return { ok: false, reason: 'REPLAYED' };
    if (factor === null) return { ok: false, reason: 'INVALID_CODE' };
    return await ctx.runMutation(internal.twoFactor.disableAfterVerification, {
      factor,
    });
  },
});

export const replaceBackupCodes = internalMutation({
  args: { factor: factorValidator, hashes: v.array(v.string()) },
  returns: verifyResultValidator,
  handler: async (ctx, { factor, hashes }): Promise<VerifyResult> => {
    const { user, state } = await requireSessionUser(ctx);
    if (state !== 'active') throw new ConvexError('TWO_FACTOR_REQUIRED');
    const cred = await credentialOf(ctx, user._id);
    if (!cred || cred.status !== 'active') {
      return { ok: false, reason: 'NOT_ENABLED' };
    }
    const result = await consumeFactor(ctx, cred, factor);
    if (!result.ok) return { ok: false, reason: result.reason };
    await ctx.db.patch(cred._id, {
      backupCodes: hashes.map((hash) => ({ hash })),
    });
    return { ok: true };
  },
});

export const regenerateBackupCodes = action({
  args: { code: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), backupCodes: v.array(v.string()) }),
    v.object({ ok: v.literal(false), reason: verifyReason }),
  ),
  handler: async (
    ctx,
    { code },
  ): Promise<
    | { ok: true; backupCodes: string[] }
    | { ok: false; reason: 'INVALID_CODE' | 'REPLAYED' | 'NOT_ENABLED' }
  > => {
    await ctx.runMutation(internal.twoFactor.consumeAttempt, {});
    const self: {
      userId: Id<'users'>;
      credential: {
        status: 'pending' | 'active';
        ciphertext: string;
        iv: string;
        keyId: 'env' | 'dev';
        lastUsedStep: number | null;
      } | null;
    } = await ctx.runQuery(internal.twoFactor.loadForAction, {});
    if (!self.credential || self.credential.status !== 'active') {
      return { ok: false, reason: 'NOT_ENABLED' };
    }
    const factor = await resolveFactor(code, self.credential, self.userId);
    if (factor === 'REPLAYED') return { ok: false, reason: 'REPLAYED' };
    if (factor === null) return { ok: false, reason: 'INVALID_CODE' };
    const { codes, hashes } = await freshBackupCodes();
    const result: VerifyResult = await ctx.runMutation(
      internal.twoFactor.replaceBackupCodes,
      { factor, hashes },
    );
    return result.ok ? { ok: true, backupCodes: codes } : result;
  },
});

// --- Administration ----------------------------------------------------------

// Reset by an administrator — the recovery path for an account whose
// holder has lost their device AND their backup codes
// (docs/backlog/comptes.md). Logged with its reason. The device, the
// backup codes and the session proofs are removed: the holder
// signs in again without a second factor, then enrolls a new one — mandatorily
// if their role is subject to it.
export const resetForUser = mutation({
  args: { userId: v.id('users'), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, reason }) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    const motif = reason.trim();
    if (motif.length < 3 || motif.length > 500) {
      throw new ConvexError('INVALID_REASON');
    }
    if (userId === admin._id) throw new ConvexError('SELF_ACTION');
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError('NOT_FOUND');
    const cred = await credentialOf(ctx, userId);
    if (!cred) throw new ConvexError('NOT_ENABLED');
    await removeCredential(ctx, userId);
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.TWO_FACTOR_RESET,
      targetId: userId,
      metadata: { reason: motif },
    });
    return null;
  },
});

// LAST RESORT: the ONLY administrator has lost their device and their backup
// codes, while 2FA is mandatory — no one can
// call `resetForUser` anymore. `internalMutation`: outside the public API, invocable
// only by the operations CLI (`npx convex run`, deployment key),
// like the administrator bootstrap (convex/bootstrap.ts). Logged without
// an actor, `via: 'cli'`. Procedure: docs/backlog/comptes.md.
export const resetByOperator = internalMutation({
  args: { email: v.string(), reason: v.string() },
  returns: v.object({ reset: v.boolean() }),
  handler: async (ctx, { email, reason }) => {
    const motif = reason.trim();
    if (motif.length < 3 || motif.length > 500) {
      throw new ConvexError('INVALID_REASON');
    }
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', normalizeEmail(email)))
      .first();
    if (!user) throw new ConvexError('NOT_FOUND');
    const had = (await credentialOf(ctx, user._id)) !== null;
    await removeCredential(ctx, user._id);
    await recordAudit(ctx, {
      action: AUDIT.TWO_FACTOR_RESET,
      targetId: user._id,
      metadata: { reason: motif, via: 'cli' },
    });
    return { reset: had };
  },
});

export const securityPolicy = query({
  args: {},
  returns: v.object({
    twoFactorRequiredForStaff: v.boolean(),
    updatedAt: v.union(v.number(), v.null()),
    keyStatus: v.union(
      v.literal('configured'),
      v.literal('dev'),
      v.literal('none'),
    ),
  }),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'admin');
    const policy = await readSecurityPolicy(ctx);
    return { ...policy, keyStatus: secretKeyStatus() };
  },
});

// 2FA requirement for moderator roles and above. Two safeguards before
// ENABLING it, so as to lock no one out:
//  - the encryption key must be configured (otherwise no one could
//    enroll);
//  - the administrator enabling it must have THEIR 2FA active (otherwise they
//    would find themselves blocked at the next screen).
export const setSecurityPolicy = mutation({
  args: { twoFactorRequiredForStaff: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { twoFactorRequiredForStaff }) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    if (twoFactorRequiredForStaff) {
      if (secretKeyStatus() === 'none') {
        throw new ConvexError('TWO_FACTOR_KEY_NOT_CONFIGURED');
      }
      const own = await credentialOf(ctx, admin._id);
      if (!own || own.status !== 'active') {
        throw new ConvexError('ENROLL_FIRST');
      }
    }
    const row = await ctx.db
      .query('securitySettings')
      .withIndex('by_key', (q) => q.eq('key', 'default'))
      .unique();
    const patch = {
      twoFactorRequiredForStaff,
      updatedBy: admin._id,
      updatedAt: Date.now(),
    };
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert('securitySettings', { key: 'default', ...patch });
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.SECURITY_POLICY_CHANGED,
      metadata: { twoFactorRequiredForStaff },
    });
    return null;
  },
});

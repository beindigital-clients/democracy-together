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

// DOUBLE AUTHENTIFICATION (TOTP, RFC 6238) — chantier comptes.
//
// PARTAGE DU TRAVAIL. La cryptographie (tirage du secret, chiffrement,
// HMAC-SHA1, empreintes) se fait dans des ACTIONS : Web Crypto et un hasard
// non déterministe y sont garantis. Les décisions qui doivent être ATOMIQUES
// — « ce pas de temps n'a jamais servi », « ce code de secours n'a jamais
// servi », « la preuve est attachée à CETTE session » — se prennent dans des
// mutations internes, sérialisées par Convex : deux envois simultanés du même
// code ne passent pas tous les deux.
//
// LA PREUVE EST LIÉE À LA SESSION (`getAuthSessionId`). Une fois la 2FA
// active, une nouvelle connexion ouvre une session sans preuve, et toutes les
// gardes (convex/lib/rbac.ts) la refusent jusqu'à la saisie du code.

const ISSUER = 'Democracy Together';

// Essais de code par compte : 6 par quart d'heure. Avec une fenêtre de trois
// codes valides sur un million, c'est ~0,17 % de chances par jour pour un
// attaquant qui a DÉJÀ le mot de passe — le rôle d'un second facteur.
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
 * Consomme un facteur de façon ATOMIQUE : un pas de temps strictement
 * postérieur au dernier accepté, ou un code de secours encore inutilisé.
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
  // Ménage : les preuves de sessions fermées depuis (déconnexion, expiration)
  // ne servent plus à rien.
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

// --- Lecture -----------------------------------------------------------------

export const status = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    pending: v.boolean(),
    backupCodesRemaining: v.number(),
    // La 2FA est OBLIGATOIRE pour ce compte (réglage + rôle).
    required: v.boolean(),
    // Cette session a présenté son second facteur.
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

// Contexte d'une action : compte, secret chiffré, dernier pas utilisé.
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

// --- Inscription d'un appareil ----------------------------------------------

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

// Étape 1 : un secret NEUF, montré une seule fois (QR code + saisie manuelle).
// Il n'est actif qu'après la confirmation d'un premier code : un secret mal
// recopié ne verrouille personne dehors.
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
    // Le code qui vient d'être saisi VAUT preuve pour la session courante :
    // inscrire son appareil ne doit pas déconnecter.
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

// Étape 2 : le premier code confirme que l'appareil a bien enregistré le
// secret. Les codes de secours sont rendus EN CLAIR une seule fois ; seules
// leurs empreintes restent en base.
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

// --- Vérification d'une session ----------------------------------------------

/** Détermine le facteur présenté : code TOTP (6 chiffres) ou code de secours. */
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
    // Juste, mais déjà utilisé : on le dit, l'utilisateur attendra le suivant.
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

// Saisie du code après connexion. Accepte un code TOTP ou un code de secours.
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

// --- Désactivation, nouveaux codes de secours --------------------------------

export const disableAfterVerification = internalMutation({
  args: { factor: factorValidator },
  returns: verifyResultValidator,
  handler: async (ctx, { factor }): Promise<VerifyResult> => {
    const { user, state } = await requireSessionUser(ctx);
    if (state !== 'active') throw new ConvexError('TWO_FACTOR_REQUIRED');
    // Rôle soumis à l'obligation : se retirer la 2FA reviendrait à
    // contourner le réglage de l'administrateur.
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

// Désactiver exige un code valide : une session laissée ouverte ne suffit
// pas à retirer le second facteur.
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

// Réinitialisation par un administrateur — la voie de reprise d'un compte dont
// le titulaire a perdu son appareil ET ses codes de secours
// (docs/backlog/comptes.md). Journalisée avec son motif. L'appareil, les
// codes de secours et les preuves de session sont retirés : le titulaire se
// reconnecte sans second facteur, puis en inscrit un nouveau — obligatoirement
// si son rôle y est soumis.
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

// DERNIER RECOURS : le SEUL administrateur a perdu son appareil et ses codes
// de secours, alors que la 2FA est obligatoire — plus personne ne peut
// appeler `resetForUser`. `internalMutation` : hors API publique, invocable
// par la seule CLI d'exploitation (`npx convex run`, clé de déploiement),
// comme l'amorçage de l'administrateur (convex/bootstrap.ts). Journalisée sans
// acteur, `via: 'cli'`. Procédure : docs/backlog/comptes.md.
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

// Obligation de 2FA pour les rôles modérateur et plus. Deux garde-fous avant
// de l'ACTIVER, pour ne verrouiller personne dehors :
//  - la clé de chiffrement doit être configurée (sinon personne ne pourrait
//    s'inscrire) ;
//  - l'administrateur qui l'active doit avoir SA 2FA active (sinon il se
//    retrouverait lui-même bloqué au prochain écran).
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

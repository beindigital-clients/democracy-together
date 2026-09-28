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

// CYCLE DE VIE DES COMPTES (chantier comptes, F-63) — création directe,
// suspension, réactivation, suppression (par un administrateur ou par le
// titulaire), export des données. Le back-office ne savait qu'inviter.
//
// Toutes les écritures d'administration sont auditées (F-67) ; les refus
// portent un CODE, traduit par l'interface (admin.feedbackErr_<CODE>).

const orgRoleValidator = v.union(v.literal('owner'), v.literal('member'));

const emailModeValidator = v.union(
  v.literal('configured'),
  v.literal('simulated'),
  v.literal('none'),
);

// --- Gardes partagées --------------------------------------------------------

/**
 * JAMAIS LE DERNIER ADMINISTRATEUR — même règle que l'amorçage
 * (convex/bootstrap.ts) et que `users.setRole`. Un administrateur SUSPENDU ne
 * compte pas : il ne peut plus rien réattribuer, ce serait un verrouillage.
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

// --- État de la session (garde de l'interface) -------------------------------

// L'interface a besoin de savoir POURQUOI une session authentifiée n'obtient
// rien : suspendue (message et déconnexion), second facteur attendu (écran de
// saisie du code), inscription 2FA obligatoire (écran de sécurité). Cette
// query ne donne accès à aucune donnée : seulement l'état.
export const sessionState = query({
  args: {},
  returns: v.object({
    state: v.union(
      v.literal('anonymous'),
      v.literal('active'),
      v.literal('suspended'),
      // Suppression en cours (le compte est suspendu le temps du traitement) :
      // l'écran ne doit pas parler de suspension à qui vient de supprimer
      // son propre compte.
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

// --- Création directe --------------------------------------------------------

// Ouvre un compte au nom de quelqu'un (secrétariat, modérateur, membre d'une
// organisation). Un compte existant n'est JAMAIS rétrogradé ni modifié : on
// renvoie l'e-mail d'accueil (sauf compte suspendu) et, si une organisation
// est choisie, on l'y rattache.
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

// Envoi dans une ACTION (réseau interdit en mutation). Un échec d'envoi ne
// remet pas le compte en cause : il existe, et l'e-mail se renvoie en recréant
// le compte (idempotent) depuis le back-office.
export const sendWelcomeEmail = internalAction({
  args: {
    email: v.string(),
    locale,
    organizationName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (_ctx, { email, locale: loc, organizationName }) => {
    // Les adresses .test (RFC 6761, E2E) ne reçoivent jamais de vrai
    // courriel, même avec un fournisseur configuré — même règle que l'OTP.
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

// --- Suspension / réactivation ----------------------------------------------

export const SUSPENSION_REASON_MIN = 3;
export const SUSPENSION_REASON_MAX = 500;

export const suspendAccount = mutation({
  args: { userId: v.id('users'), reason: v.string() },
  returns: v.object({ sessionsRevoked: v.number() }),
  handler: async (ctx, { userId, reason }) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    const motif = reason.trim();
    // Motif OBLIGATOIRE : une suspension sans raison écrite ne se justifie ni
    // auprès de la personne, ni devant le bureau, ni au prochain
    // administrateur qui voudra la lever.
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
    // Les sessions ouvertes sont SUPPRIMÉES, jetons de rafraîchissement
    // compris : le jeton d'accès en cours (1 h au plus) n'ouvre plus rien,
    // puisque toutes les gardes lisent la suspension, et il ne pourra pas
    // être renouvelé.
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
    // Un compte en cours de SUPPRESSION porte aussi une suspension : elle ne
    // se lève pas, la suppression est irréversible.
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

// --- Suppression -------------------------------------------------------------

/**
 * Lance la suppression d'un compte. Le compte est aussitôt SUSPENDU (plus
 * aucun accès, plus de connexion) et ses sessions supprimées ; le
 * traitement se poursuit par lots dans `runAccountDeletion`.
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

// Suppression par un administrateur — CONFIRMATION EN DEUX TEMPS : l'écran
// demande d'abord de confirmer, puis de RETAPER l'adresse du compte. Le
// serveur exige cette adresse : un appel direct à l'API sans elle échoue,
// l'étape n'est pas qu'un effet d'interface.
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
    // L'adresse ne servait qu'au traitement : elle part avec lui.
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

// --- Libre-service : export et suppression de SES données --------------------

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

// Droit d'accès et à la portabilité (RGPD art. 15 et 20) — manque relevé par
// l'audit. Le fichier ne contient QUE ce qui se rattache au compte appelant :
// chaque module du registre lit par l'identifiant du compte (ou son adresse),
// jamais par un argument du client. Ni secret 2FA, ni empreinte de mot de
// passe. La date d'export est posée par le client : une query ne lit pas
// l'horloge (guidelines Convex).
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

// Compte appelant, pour une ACTION (qui n'a pas de base) : l'identité de
// l'action est propagée à cette query, les gardes s'appliquent entières.
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
    // Anti-abus : chaque demande envoie un courriel.
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
    // DEV/TEST (AUTH_DEV_OTP) : le code en clair, relu par la spec E2E par
    // l'oracle existant (`otp:latestDevCode`). Jamais en production.
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

// Étape 1 de la suppression en libre-service : un code est envoyé à
// l'adresse du compte. Une session volée (poste resté ouvert) ne suffit donc
// pas à effacer un compte : il faut aussi la boîte aux lettres.
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
    // Refus AVANT de créer un code : sans fournisseur (et hors dev), le code
    // ne partirait jamais et l'écran attendrait en vain.
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

// Rend un RÉSULTAT au lieu de lever sur un mauvais code : une exception
// annulerait la transaction, donc le décompte des essais.
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
    // Le dernier administrateur ne peut pas s'effacer lui-même : lève
    // LAST_ADMIN, que l'écran traduit.
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

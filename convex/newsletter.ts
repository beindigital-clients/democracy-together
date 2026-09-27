import { v, ConvexError, type Infer } from 'convex/values';
import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import {
  action,
  mutation,
  query,
  internalQuery,
  internalMutation,
  internalAction,
  type MutationCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { isEmail } from './lib/validation';
import {
  enforcePublicFormLimit,
  enforceRateLimit,
  RATE_LIMITS,
} from './lib/rateLimit';
import { enforceRecaptcha } from './lib/recaptcha';
import { requireNetworkRole } from './lib/rbac';
import { COUNTER, bumpCounter, readCounter } from './lib/counters';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import {
  emailProviderStatus,
  sendEmail,
  sendEmailBatch,
  TransientEmailError,
} from './email';
import { locale, type SiteLocale } from './schema';
import {
  CONFIRM_TTL_MS,
  LEGACY_CONFIRM_TTL_MS,
  CONSENT_TEXT_VERSION,
  canResendConfirmation,
  hashToken,
  isTokenShaped,
  newConfirmToken,
  normalizeSource,
  subscriptionSourceValidator,
} from './lib/newsletterOptIn';
import {
  campaignHtml,
  confirmationEmail,
  listUnsubscribeHeaders,
  pickVariant,
  testSubject,
  type CampaignContent,
} from './lib/newsletterContent';
import {
  CLAIM_LEASE_MS,
  MAX_TRANSIENT_ATTEMPTS,
  backoffMs,
  deliveryConfig,
  idempotencyKey,
} from './lib/newsletterDelivery';

// Jeton aléatoire (lien de désinscription).
function newToken(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

const campaignStatus = v.union(
  v.literal('draft'),
  v.literal('sending'),
  v.literal('sent'),
  v.literal('error'),
);

// =============================================================================
// ABONNEMENT PUBLIC — DOUBLE OPT-IN (F-18)
// =============================================================================
//
// Portail anti-spam : l'action vérifie reCAPTCHA v3 (seules les actions ont
// `fetch`) puis délègue à `recordSubscription` (internalMutation -> non
// appelable directement, donc la porte captcha ne se contourne pas).
//
// L'inscription ne fait plus d'abonné : elle crée une ATTENTE et envoie un
// lien de confirmation. Seul le clic sur ce lien — la preuve que la personne
// qui a saisi l'adresse la lit — ouvre les envois (cadrage § 2.15, « double
// opt-in »).
export const subscribe = action({
  args: {
    email: v.string(),
    locale: v.optional(locale),
    // Formulaire d'origine (accueil, pied de page, page dédiée) — conservé
    // avec la preuve du consentement.
    source: subscriptionSourceValidator,
    captchaToken: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'newsletter');
    // FAIL-CLOSED, comme les campagnes : sans fournisseur, le lien de
    // confirmation ne partirait pas, et le formulaire dirait « vérifiez votre
    // boîte » pour un courriel qui n'arrivera jamais. Le refus est le même
    // pour TOUTES les adresses : il ne renseigne sur aucune.
    if (emailProviderStatus().mode === 'none') {
      throw new ConvexError('EMAIL_PROVIDER_NOT_CONFIGURED');
    }
    // ORACLE D'EXISTENCE REFERMÉ (pentest M-8, audit F-09).
    //
    // La mutation interne distingue toujours « déjà connu » de « nouveau » —
    // elle en a besoin pour ne pas dupliquer ni recompter. Mais cette
    // distinction ne FRANCHIT PAS la frontière publique : la réponse est
    // IDENTIQUE dans tous les cas (nouvelle adresse, attente, abonné
    // confirmé). Le courriel de confirmation est lui-même envoyé par une
    // fonction PLANIFIÉE : l'action répond avant, et son temps de réponse ne
    // dépend pas de l'envoi.
    await ctx.runMutation(internal.newsletter.recordSubscription, input);
    return { ok: true };
  },
});

export const recordSubscription = internalMutation({
  args: {
    email: v.string(),
    locale: v.optional(locale),
    source: subscriptionSourceValidator,
  },
  returns: v.object({ ok: v.boolean(), already: v.boolean() }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!isEmail(email)) throw new Error('INVALID_EMAIL');

    // Plafonds NON FORGEABLES (audit M2) — par IP et global par formulaire :
    // changer d'adresse ne rend plus un quota neuf. Cf. lib/rateLimit.ts.
    await enforcePublicFormLimit(ctx, 'newsletter');

    await enforceRateLimit(ctx, {
      key: `newsletter:${email}`,
      ...RATE_LIMITS.newsletter,
    });

    const now = Date.now();
    const consent = {
      at: now,
      source: normalizeSource(args.source),
      locale: args.locale,
      textVersion: CONSENT_TEXT_VERSION,
    };

    const existing = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();

    if (existing) {
      if (existing.status === 'confirmed') return { ok: true, already: true };

      if (existing.status === undefined) {
        // Abonné HÉRITÉ (avant le double opt-in) qui se réinscrit : c'est un
        // consentement NOUVEAU, exprimé maintenant — on le traite comme tel,
        // attente et lien compris. Le compteur ne le comptait pas (il ne
        // compte que les confirmés) : il le comptera à la confirmation.
        await ctx.db.patch(existing._id, {
          status: 'pending',
          locale: args.locale ?? existing.locale,
          consent,
          confirmSends: 1,
          confirmLastSentAt: now,
          confirmExpiresAt: now + CONFIRM_TTL_MS,
        });
        await ctx.scheduler.runAfter(0, internal.newsletter.sendConfirmation, {
          subscriptionId: existing._id,
          legacy: false,
        });
        return { ok: true, already: true };
      }

      // En attente : RENVOI BORNÉ du lien (cf. lib/newsletterOptIn.ts). Hors
      // bornes, rien ne part — et la réponse publique est la même.
      if (canResendConfirmation(existing, now)) {
        await ctx.db.patch(existing._id, {
          locale: args.locale ?? existing.locale,
          confirmSends: (existing.confirmSends ?? 0) + 1,
          confirmLastSentAt: now,
          // Le délai repart : l'abonné vient de redemander le lien.
          confirmExpiresAt: now + CONFIRM_TTL_MS,
        });
        await ctx.scheduler.runAfter(0, internal.newsletter.sendConfirmation, {
          subscriptionId: existing._id,
          legacy: false,
        });
      }
      return { ok: true, already: true };
    }

    const subscriptionId = await ctx.db.insert('newsletterSubscriptions', {
      email,
      locale: args.locale,
      unsubToken: newToken(),
      createdAt: now,
      status: 'pending',
      consent,
      confirmSends: 1,
      confirmLastSentAt: now,
      confirmExpiresAt: now + CONFIRM_TTL_MS,
    });
    // PAS d'incrément du compteur d'abonnés : il compte les CONFIRMÉS, ceux
    // qui reçoivent les campagnes.
    await ctx.scheduler.runAfter(0, internal.newsletter.sendConfirmation, {
      subscriptionId,
      legacy: false,
    });
    return { ok: true, already: false };
  },
});

// Envoi du lien de confirmation. Le jeton est tiré ICI, dans l'action, et
// n'existe en clair qu'en mémoire et dans le courriel : il ne transite ni par
// les arguments d'une fonction planifiée (stockés par le planificateur) ni par
// la base, qui n'en reçoit que l'empreinte.
export const sendConfirmation = internalAction({
  args: {
    subscriptionId: v.id('newsletterSubscriptions'),
    legacy: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { subscriptionId, legacy }) => {
    const token = newConfirmToken();
    const target = await ctx.runMutation(internal.newsletter._armConfirmation, {
      subscriptionId,
      tokenHash: await hashToken(token),
      ttlMs: legacy ? LEGACY_CONFIRM_TTL_MS : CONFIRM_TTL_MS,
    });
    if (!target) return null; // désinscrit ou déjà confirmé entre-temps
    const loc: SiteLocale = target.locale ?? 'fr';
    const mail = confirmationEmail(token, loc, legacy);
    try {
      await sendEmail({
        to: target.email,
        subject: mail.subject,
        html: mail.html,
      });
    } catch (err) {
      // L'attente reste en place et expirera ; l'abonné peut redemander le
      // lien. On journalise sans l'adresse.
      console.error(
        `[newsletter] confirmation non envoyée : ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
    // DEV/TEST seulement : boîte d'envoi lisible par l'E2E, comme les codes
    // OTP (`devOtpCodes`). La garde est dans la mutation.
    if (process.env.AUTH_DEV_OTP === 'true') {
      await ctx.runMutation(internal.newsletter._devRecordOutbox, {
        to: target.email,
        kind: 'newsletter-confirmation',
        subject: mail.subject,
        link: mail.url,
      });
    }
    return null;
  },
});

export const _armConfirmation = internalMutation({
  args: {
    subscriptionId: v.id('newsletterSubscriptions'),
    tokenHash: v.string(),
    ttlMs: v.number(),
  },
  returns: v.union(
    v.null(),
    v.object({ email: v.string(), locale: v.optional(locale) }),
  ),
  handler: async (ctx, { subscriptionId, tokenHash, ttlMs }) => {
    const sub = await ctx.db.get(subscriptionId);
    if (!sub || sub.status !== 'pending') return null;
    // Un nouveau lien REMPLACE le précédent : seul le dernier courriel reçu
    // confirme. Un vieux lien retrouvé plus tard ne vaut plus rien.
    await ctx.db.patch(subscriptionId, {
      confirmTokenHash: tokenHash,
      confirmExpiresAt: Date.now() + ttlMs,
    });
    return { email: sub.email, locale: sub.locale };
  },
});

export const _devRecordOutbox = internalMutation({
  args: {
    to: v.string(),
    kind: v.string(),
    subject: v.string(),
    link: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Ceinture et bretelles : même appelée par erreur, cette mutation n'écrit
    // rien hors du mode développement.
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    await ctx.db.insert('devOutbox', { ...args, createdAt: Date.now() });
    return null;
  },
});

// Confirmation par jeton (lien du courriel). Publique : le jeton EST
// l'autorisation. Usage unique — l'empreinte est effacée à la confirmation —
// et expirant. La réponse dit l'issue (et la langue de l'abonné, pour que la
// page parle la sienne) ; ce n'est pas un oracle d'existence, pour la même
// raison que `unsubscribe` : un jeton de 256 bits n'identifie aucune adresse
// qu'un tiers pourrait choisir.
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
    const tokenHash = await hashToken(clean);
    const sub = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_confirm_hash', (q) => q.eq('confirmTokenHash', tokenHash))
      .unique();
    if (!sub || sub.status !== 'pending') {
      return { status: 'invalid' as const, locale: null };
    }
    const now = Date.now();
    if (sub.confirmExpiresAt !== undefined && sub.confirmExpiresAt < now) {
      return { status: 'expired' as const, locale: sub.locale ?? null };
    }
    await ctx.db.patch(sub._id, {
      status: 'confirmed',
      confirmedAt: now,
      confirmTokenHash: undefined,
      confirmExpiresAt: undefined,
    });
    await bumpCounter(ctx, COUNTER.NEWSLETTER_SUBSCRIBERS, 1);
    return { status: 'confirmed' as const, locale: sub.locale ?? null };
  },
});

// Désinscription par jeton (lien dans l'e-mail) — idempotente.
//
// `found` dit si le jeton correspondait à un abonnement. Sans lui, la page
// confirmait « vous êtes désinscrit » à un jeton inventé (mesuré le 27/09,
// vitrine O2 / R-09) : un abonné dont le lien est tronqué ou expiré croyait
// avoir réussi, et restait abonné. CE N'EST PAS UN ORACLE D'EXISTENCE : le
// jeton est un secret aléatoire de 128 bits, il n'identifie aucune adresse —
// contrairement à l'oracle refermé sur `subscribe` (F-09), qui répondait à une
// adresse choisie. Un lien cliqué deux fois répond `found: false` la seconde
// fois : l'abonné est parti, la page le dit comme « lien expiré ».
async function unsubscribeByTokenImpl(
  ctx: MutationCtx,
  token: string,
): Promise<{ ok: boolean; found: boolean }> {
  if (!token) return { ok: false, found: false };
  const sub = await ctx.db
    .query('newsletterSubscriptions')
    .withIndex('by_token', (q) => q.eq('unsubToken', token))
    .unique();
  if (!sub) return { ok: true, found: false };
  await ctx.db.delete(sub._id);
  // Seuls les CONFIRMÉS sont comptés : une attente (ou un héritier non
  // migré) qui se désinscrit ne décompte rien.
  if (sub.status === 'confirmed') {
    await bumpCounter(ctx, COUNTER.NEWSLETTER_SUBSCRIBERS, -1);
  }
  return { ok: true, found: true };
}

export const unsubscribe = mutation({
  args: { token: v.string() },
  returns: v.object({ ok: v.boolean(), found: v.boolean() }),
  handler: (ctx, { token }) => unsubscribeByTokenImpl(ctx, token),
});

// Désinscription « en un clic » (RFC 8058) — appelée par le point d'entrée
// HTTP `POST /newsletter/unsubscribe` (convex/newsletterHttp.ts).
export const unsubscribeByToken = internalMutation({
  args: { token: v.string() },
  returns: v.object({ ok: v.boolean(), found: v.boolean() }),
  handler: (ctx, { token }) => unsubscribeByTokenImpl(ctx, token),
});

// Purge planifiée (cron horaire) des attentes EXPIRÉES : une adresse saisie
// par un tiers et jamais confirmée ne reste pas en base au-delà de son délai
// (minimisation, RGPD art. 5.1.c). Et la boîte d'envoi de développement.
const PURGE_BATCH = 200;
export const purgeExpiredPending = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_status_and_expiry', (q) =>
        q.eq('status', 'pending').lt('confirmExpiresAt', now),
      )
      .take(PURGE_BATCH);
    for (const s of expired) await ctx.db.delete(s._id);

    const outbox = await ctx.db
      .query('devOutbox')
      .withIndex('by_createdAt', (q) => q.lt('createdAt', now - 86_400_000))
      .take(PURGE_BATCH);
    for (const o of outbox) await ctx.db.delete(o._id);

    if (expired.length === PURGE_BATCH || outbox.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.newsletter.purgeExpiredPending,
        {},
      );
    }
    return { deleted: expired.length };
  },
});

// MIGRATION DES ABONNÉS HÉRITÉS (antérieurs au double opt-in).
//
// DÉCISION (docs/backlog/diffusion.md § Migration) : ils ne sont PAS réputés
// confirmés. L'ancien formulaire acceptait n'importe quelle adresse sans
// vérification — c'est précisément ce que le double opt-in corrige —, et
// l'association ne peut donc pas démontrer (RGPD art. 7.1) que la personne
// derrière chaque adresse a consenti. Chacun reçoit UNE demande de
// confirmation (délai de 30 jours) ; sans réponse, l'adresse est purgée.
//
// À lancer une fois, par la CLI (contexte de confiance), APRÈS avoir posé la
// clé du fournisseur : `npx convex run newsletter:migrateLegacySubscribers`.
// Par lots de 100, étalés au débit configuré ; se replanifie jusqu'au bout.
const MIGRATION_BATCH = 100;
export const migrateLegacySubscribers = internalMutation({
  args: {},
  returns: v.object({ migrated: v.number(), done: v.boolean() }),
  handler: async (ctx) => {
    if (emailProviderStatus().mode === 'none') {
      // Relancer sans pouvoir écrire ferait expirer — donc supprimer — des
      // abonnés qu'on n'aurait jamais prévenus.
      throw new ConvexError('EMAIL_PROVIDER_NOT_CONFIGURED');
    }
    const legacy = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_status_and_expiry', (q) => q.eq('status', undefined))
      .take(MIGRATION_BATCH);
    const now = Date.now();
    const { intervalMs, batchSize } = deliveryConfig();
    for (let i = 0; i < legacy.length; i++) {
      const s = legacy[i];
      await ctx.db.patch(s._id, {
        status: 'pending',
        consent: {
          // La seule date connue est celle de l'inscription d'origine ; la
          // source dit qu'elle n'a pas été confirmée à l'époque.
          at: s.createdAt,
          source: 'legacy',
          locale: s.locale,
          textVersion: 'legacy',
        },
        confirmSends: 1,
        confirmLastSentAt: now,
        confirmExpiresAt: now + LEGACY_CONFIRM_TTL_MS,
      });
      await ctx.scheduler.runAfter(
        Math.floor(i / batchSize) * intervalMs,
        internal.newsletter.sendConfirmation,
        { subscriptionId: s._id, legacy: true },
      );
    }
    if (legacy.length > 0) {
      await recordAudit(ctx, {
        action: AUDIT.NEWSLETTER_LEGACY_MIGRATED,
        metadata: { count: legacy.length },
      });
    }
    const done = legacy.length < MIGRATION_BATCH;
    if (!done) {
      await ctx.scheduler.runAfter(
        Math.ceil(MIGRATION_BATCH / batchSize) * intervalMs,
        internal.newsletter.migrateLegacySubscribers,
        {},
      );
    }
    return { migrated: legacy.length, done };
  },
});

// Données newsletter d'un compte supprimé : l'abonnement est lié à l'adresse,
// pas au compte. À brancher dans la suppression de compte (orchestrateur).
export async function deleteUserDataDiffusion(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<void> {
  const user = await ctx.db.get(userId);
  const email = user?.email?.trim().toLowerCase();
  if (!email) return;
  const sub = await ctx.db
    .query('newsletterSubscriptions')
    .withIndex('by_email', (q) => q.eq('email', email))
    .unique();
  if (!sub) return;
  await ctx.db.delete(sub._id);
  if (sub.status === 'confirmed') {
    await bumpCounter(ctx, COUNTER.NEWSLETTER_SUBSCRIBERS, -1);
  }
}

// --- Oracles DEV/TEST (garde AUTH_DEV_OTP) -----------------------------------
//
// DEV/TEST seulement : rend le jeton de désinscription d'une adresse, pour que
// l'E2E puisse suivre le lien de l'e-mail comme le ferait un abonné (audit
// F-12). CE N'EST PAS UNE RÉOUVERTURE DE L'ORACLE REFERMÉ EN F-09 : c'est une
// `internalQuery` — hors API publique, appelable par aucun client — doublée de
// la garde AUTH_DEV_OTP, invoquée par la CLI Convex en contexte de confiance.
export const devUnsubToken = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const sub = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
      .unique();
    return sub?.unsubToken ?? null;
  },
});

// DEV/TEST seulement (garde AUTH_DEV_OTP) : l'adresse est-elle en base
// (attente OU confirmée) ?
export const isSubscribed = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.boolean(), v.null()),
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const sub = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
      .unique();
    return Boolean(sub);
  },
});

// DEV/TEST seulement (garde AUTH_DEV_OTP) : état du double opt-in.
export const devSubscriptionStatus = internalQuery({
  args: { email: v.string() },
  returns: v.union(
    v.literal('pending'),
    v.literal('confirmed'),
    v.literal('legacy'),
    v.null(),
  ),
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const sub = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
      .unique();
    if (!sub) return null;
    return sub.status ?? 'legacy';
  },
});

// DEV/TEST seulement (garde AUTH_DEV_OTP) : dernier lien de confirmation
// « envoyé » à une adresse — ce que l'E2E suit, comme `otp.latestDevCode`.
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
    return rows.find((r) => r.kind === 'newsletter-confirmation')?.link ?? null;
  },
});

// =============================================================================
// BACK-OFFICE — abonnés et campagnes (éditeur et au-dessus)
// =============================================================================

// Nombre d'abonnés CONFIRMÉS — ceux qu'une campagne atteindra. Compteur
// dénormalisé (convex/counters.ts) : une lecture d'une ligne (issue #8).
export const subscriberCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    return await readCounter(ctx, COUNTER.NEWSLETTER_SUBSCRIBERS);
  },
});

// Attentes en cours et héritées non migrées — bornées : au-delà de 1 000, un
// « 1000+ » suffit à l'écran, et le compter exactement coûterait la table.
const COUNT_CAP = 1000;
export const subscriberBreakdown = query({
  args: {},
  returns: v.object({
    confirmed: v.number(),
    pending: v.number(),
    legacy: v.number(),
    capped: v.number(),
  }),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    const [pending, legacy] = await Promise.all([
      ctx.db
        .query('newsletterSubscriptions')
        .withIndex('by_status_and_expiry', (q) => q.eq('status', 'pending'))
        .take(COUNT_CAP),
      ctx.db
        .query('newsletterSubscriptions')
        .withIndex('by_status_and_expiry', (q) => q.eq('status', undefined))
        .take(COUNT_CAP),
    ]);
    return {
      confirmed: await readCounter(ctx, COUNTER.NEWSLETTER_SUBSCRIBERS),
      pending: pending.length,
      legacy: legacy.length,
      capped: COUNT_CAP,
    };
  },
});

const subscriberRow = v.object({
  _id: v.id('newsletterSubscriptions'),
  email: v.string(),
  status: v.union(
    v.literal('pending'),
    v.literal('confirmed'),
    v.literal('legacy'),
  ),
  locale: v.union(locale, v.null()),
  createdAt: v.number(),
  confirmedAt: v.union(v.number(), v.null()),
  consentSource: v.union(v.string(), v.null()),
  consentAt: v.union(v.number(), v.null()),
});

function projectSubscriber(s: Doc<'newsletterSubscriptions'>) {
  return {
    _id: s._id,
    email: s.email,
    status: s.status ?? ('legacy' as const),
    locale: s.locale ?? null,
    createdAt: s.createdAt,
    confirmedAt: s.confirmedAt ?? null,
    consentSource: s.consent?.source ?? null,
    consentAt: s.consent?.at ?? null,
  };
}

// Liste des abonnés, paginée, avec la preuve du consentement. `email` exact
// = recherche d'UNE adresse (demande d'accès, désinscription par
// l'administration). Jamais de jeton dans la réponse.
export const listSubscribers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(v.literal('pending'), v.literal('confirmed'))),
    email: v.optional(v.string()),
  },
  returns: paginationResultValidator(subscriberRow),
  handler: async (ctx, { paginationOpts, status, email }) => {
    await requireNetworkRole(ctx, 'editeur');
    const wanted = email?.trim().toLowerCase();
    if (wanted) {
      const sub = await ctx.db
        .query('newsletterSubscriptions')
        .withIndex('by_email', (q) => q.eq('email', wanted))
        .unique();
      return {
        page: sub ? [projectSubscriber(sub)] : [],
        isDone: true,
        continueCursor: '',
      };
    }
    const result = status
      ? await ctx.db
          .query('newsletterSubscriptions')
          .withIndex('by_status_and_expiry', (q) => q.eq('status', status))
          .order('desc')
          .paginate(paginationOpts)
      : await ctx.db
          .query('newsletterSubscriptions')
          .order('desc')
          .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map(projectSubscriber),
    };
  },
});

// État du fournisseur d'e-mail, annoncé en tête de l'écran (campagne du
// 27/09, R-07). Lu au moment de la requête : poser la clé sur le déploiement
// suffit, sans redéploiement du code.
export const emailStatus = query({
  args: {},
  returns: v.object({
    provider: v.string(),
    mode: v.union(
      v.literal('configured'),
      v.literal('simulated'),
      v.literal('none'),
    ),
    batchSize: v.number(),
    ratePerMinute: v.number(),
  }),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    const { batchSize, ratePerMinute } = deliveryConfig();
    return { ...emailProviderStatus(), batchSize, ratePerMinute };
  },
});

const variantValidator = v.object({
  locale,
  subject: v.string(),
  body: v.string(),
});

// Liste bornée aux 50 campagnes les plus récentes : l'écran n'en montre pas
// davantage, et la table ne doit pas être relue entière à chaque progrès
// d'envoi (la liste est réactive).
export const listCampaigns = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('newsletterCampaigns'),
      subject: v.string(),
      body: v.string(),
      locale,
      variants: v.array(variantValidator),
      status: campaignStatus,
      createdAt: v.number(),
      sentAt: v.union(v.number(), v.null()),
      recipientCount: v.union(v.number(), v.null()),
      failedCount: v.union(v.number(), v.null()),
      skippedCount: v.number(),
      totalCount: v.number(),
      enqueueDone: v.boolean(),
      lastTestAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    const recent = await ctx.db
      .query('newsletterCampaigns')
      .order('desc')
      .take(50);
    return recent.map((c) => ({
      _id: c._id,
      subject: c.subject,
      // Le corps sert l'aperçu AVANT envoi (campagne du 27/09, R-07).
      body: c.body,
      locale: c.locale ?? 'fr',
      variants: c.variants ?? [],
      status: c.status,
      createdAt: c.createdAt,
      sentAt: c.sentAt ?? null,
      recipientCount: c.recipientCount ?? null,
      failedCount: c.failedCount ?? null,
      skippedCount: c.skippedCount ?? 0,
      totalCount: c.totalCount ?? 0,
      enqueueDone: c.enqueueDone ?? false,
      lastTestAt: c.lastTestAt ?? null,
    }));
  },
});

const SUBJECT_MIN = 3;
const SUBJECT_MAX = 200;
const BODY_MIN = 10;
const BODY_MAX = 50_000;

function checkContent(subject: string, body: string) {
  const s = subject.trim();
  const b = body.trim();
  if (
    s.length < SUBJECT_MIN ||
    s.length > SUBJECT_MAX ||
    b.length < BODY_MIN ||
    b.length > BODY_MAX
  ) {
    throw new Error('INVALID_CAMPAIGN');
  }
  return { subject: s, body: b };
}

export const createCampaign = mutation({
  args: { subject: v.string(), body: v.string(), locale: v.optional(locale) },
  returns: v.id('newsletterCampaigns'),
  handler: async (ctx, args) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const { subject, body } = checkContent(args.subject, args.body);
    return await ctx.db.insert('newsletterCampaigns', {
      subject,
      body,
      locale: args.locale ?? 'fr',
      status: 'draft',
      createdBy: editor._id,
      createdAt: Date.now(),
    });
  },
});

async function requireDraft(
  ctx: MutationCtx,
  campaignId: Id<'newsletterCampaigns'>,
) {
  const campaign = await ctx.db.get(campaignId);
  if (!campaign) throw new Error('NOT_FOUND');
  if (campaign.status !== 'draft') throw new Error('ALREADY_SENT');
  return campaign;
}

// Version traduite d'un brouillon : une par langue, remplacée si elle existe.
// La langue de référence n'a pas de « variante » — on édite la campagne.
export const upsertCampaignVariant = mutation({
  args: {
    campaignId: v.id('newsletterCampaigns'),
    locale,
    subject: v.string(),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireNetworkRole(ctx, 'editeur');
    const campaign = await requireDraft(ctx, args.campaignId);
    if (args.locale === (campaign.locale ?? 'fr')) {
      throw new Error('VARIANT_IS_REFERENCE');
    }
    const content = checkContent(args.subject, args.body);
    const variants = (campaign.variants ?? []).filter(
      (x) => x.locale !== args.locale,
    );
    variants.push({ locale: args.locale, ...content });
    await ctx.db.patch(args.campaignId, { variants });
    return null;
  },
});

export const removeCampaignVariant = mutation({
  args: { campaignId: v.id('newsletterCampaigns'), locale },
  returns: v.null(),
  handler: async (ctx, { campaignId, locale: loc }) => {
    await requireNetworkRole(ctx, 'editeur');
    const campaign = await requireDraft(ctx, campaignId);
    await ctx.db.patch(campaignId, {
      variants: (campaign.variants ?? []).filter((x) => x.locale !== loc),
    });
    return null;
  },
});

// ENVOI DE TEST À SOI-MÊME : toutes les versions (référence + traductions)
// partent vers l'adresse du compte de l'éditeur, objet préfixé « [TEST] ».
// Rien n'est mis en file, le brouillon reste un brouillon.
export const sendTestCampaign = mutation({
  args: { campaignId: v.id('newsletterCampaigns') },
  returns: v.object({ ok: v.boolean(), to: v.string(), versions: v.number() }),
  handler: async (ctx, { campaignId }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) throw new Error('NOT_FOUND');
    if (emailProviderStatus().mode === 'none') {
      throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
    }
    const to = editor.email?.trim().toLowerCase();
    if (!to || !isEmail(to)) throw new Error('NO_EDITOR_EMAIL');
    await enforceRateLimit(ctx, {
      key: `nlTest:${editor._id}`,
      max: 10,
      windowMs: 60 * 60 * 1000,
    });
    await ctx.db.patch(campaignId, { lastTestAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.newsletter._deliverTest, {
      campaignId,
      to,
    });
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.NEWSLETTER_TEST_SENT,
      targetId: campaignId,
    });
    return { ok: true, to, versions: 1 + (campaign.variants?.length ?? 0) };
  },
});

export const _deliverTest = internalAction({
  args: { campaignId: v.id('newsletterCampaigns'), to: v.string() },
  returns: v.null(),
  handler: async (ctx, { campaignId, to }) => {
    const campaign: CampaignContent | null = await ctx.runQuery(
      internal.newsletter._campaignContent,
      { campaignId },
    );
    if (!campaign) return null;
    const locales: SiteLocale[] = [
      campaign.locale ?? 'fr',
      ...(campaign.variants ?? []).map((x) => x.locale),
    ];
    for (const loc of locales) {
      const version = pickVariant(campaign, loc);
      try {
        await sendEmail({
          to,
          subject: testSubject(version.subject, version.locale),
          // Jeton factice : le lien de désinscription d'un test ne doit
          // désinscrire personne.
          html: campaignHtml(version.body, 'test', version.locale),
          headers: listUnsubscribeHeaders('test', version.locale),
        });
      } catch (err) {
        console.error(
          `[newsletter] envoi de test en échec : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return null;
  },
});

export const _campaignContent = internalQuery({
  args: { campaignId: v.id('newsletterCampaigns') },
  returns: v.union(
    v.null(),
    v.object({
      subject: v.string(),
      body: v.string(),
      locale: v.optional(locale),
      variants: v.optional(v.array(variantValidator)),
    }),
  ),
  handler: async (ctx, { campaignId }) => {
    const c = await ctx.db.get(campaignId);
    if (!c) return null;
    return {
      subject: c.subject,
      body: c.body,
      locale: c.locale,
      variants: c.variants,
    };
  },
});

// Lance l'envoi : passe en 'sending', puis la MISE EN FILE (une ligne
// `newsletterDeliveries` par abonné confirmé, par pages de 500) et la
// LIVRAISON par lots sont planifiées. L'écran suit la progression en direct.
export const sendCampaign = mutation({
  args: { campaignId: v.id('newsletterCampaigns') },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { campaignId }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) throw new Error('NOT_FOUND');
    if (campaign.status !== 'draft') throw new Error('ALREADY_SENT');
    // Sans fournisseur, la livraison échouerait abonné par abonné et la
    // campagne finirait « Erreur » sans un mot : on refuse AVANT, et l'écran
    // traduit le code (campagne du 27/09, R-07). En dev/test explicite
    // (AUTH_DEV_OTP=true) l'envoi simulé reste possible.
    if (emailProviderStatus().mode === 'none') {
      throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
    }
    await ctx.db.patch(campaignId, {
      status: 'sending',
      startedAt: Date.now(),
      totalCount: 0,
      recipientCount: 0,
      failedCount: 0,
      skippedCount: 0,
      enqueueDone: false,
    });
    await ctx.scheduler.runAfter(0, internal.newsletter._enqueue, {
      campaignId,
      cursor: null,
    });
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.NEWSLETTER_CAMPAIGN_SENT,
      targetId: campaignId,
    });
    return { ok: true };
  },
});

// MISE EN FILE, par pages. IDEMPOTENTE : une page rejouée (reprise après
// erreur) ne crée pas de seconde ligne pour un abonné déjà en file — donc pas
// de second envoi.
const ENQUEUE_PAGE = 500;
export const _enqueue = internalMutation({
  args: {
    campaignId: v.id('newsletterCampaigns'),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { campaignId, cursor }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.status !== 'sending') return null;
    const page = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_status_and_expiry', (q) => q.eq('status', 'confirmed'))
      .paginate({ numItems: ENQUEUE_PAGE, cursor });
    let added = 0;
    for (const sub of page.page) {
      const already = await ctx.db
        .query('newsletterDeliveries')
        .withIndex('by_campaign_and_subscription', (q) =>
          q.eq('campaignId', campaignId).eq('subscriptionId', sub._id),
        )
        .first();
      if (already) continue;
      await ctx.db.insert('newsletterDeliveries', {
        campaignId,
        subscriptionId: sub._id,
        status: 'queued',
        attempts: 0,
        locale: sub.locale,
      });
      added++;
    }
    await ctx.db.patch(campaignId, {
      totalCount: (campaign.totalCount ?? 0) + added,
      enqueueDone: page.isDone,
    });
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.newsletter._enqueue, {
        campaignId,
        cursor: page.continueCursor,
      });
    }
    // La livraison démarre dès la première page : une grande liste n'attend
    // pas d'être entièrement en file pour que les premiers lots partent.
    if (cursor === null) {
      await ctx.scheduler.runAfter(0, internal.newsletter._processBatch, {
        campaignId,
      });
    }
    return null;
  },
});

const recipientValidator = v.object({
  deliveryId: v.id('newsletterDeliveries'),
  email: v.string(),
  locale: v.optional(locale),
  unsubToken: v.string(),
});

const claimResult = v.union(
  v.object({
    kind: v.literal('batch'),
    claimId: v.string(),
    attempt: v.number(),
    recipients: v.array(recipientValidator),
  }),
  // `retryInMs` : quand revenir. Un lot en vol se reprend à l'échéance de
  // son bail, pas avant ; une mise en file en cours, au prochain intervalle.
  v.object({ kind: v.literal('wait'), retryInMs: v.optional(v.number()) }),
  v.object({ kind: v.literal('done') }),
);

// Prend un LOT en charge. Trois cas, dans cet ordre :
//  1. un lot resté « en cours » au-delà du bail (action coupée) est REPRIS tel
//     quel, avec son `claimId` — donc la même clé d'idempotence ;
//  2. sinon, les `batchSize` lignes suivantes en file forment un nouveau lot ;
//  3. sinon, la campagne est terminée (si la mise en file l'est aussi).
export const _claimBatch = internalMutation({
  args: { campaignId: v.id('newsletterCampaigns'), batchSize: v.number() },
  returns: claimResult,
  handler: async (ctx, { campaignId, batchSize }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.status !== 'sending')
      return { kind: 'done' as const };
    const now = Date.now();

    const inFlight = await ctx.db
      .query('newsletterDeliveries')
      .withIndex('by_campaign_and_status', (q) =>
        q.eq('campaignId', campaignId).eq('status', 'sending'),
      )
      .take(1);
    if (inFlight.length > 0) {
      const stale = inFlight[0];
      if (
        stale.claimId === undefined ||
        (stale.claimedAt ?? 0) > now - CLAIM_LEASE_MS
      ) {
        return {
          kind: 'wait' as const,
          retryInMs: (stale.claimedAt ?? now) + CLAIM_LEASE_MS - now + 1,
        };
      }
      const rows = await ctx.db
        .query('newsletterDeliveries')
        .withIndex('by_claim', (q) => q.eq('claimId', stale.claimId))
        .collect();
      // Le lot est rejoué À L'IDENTIQUE — mêmes destinataires, même clé :
      // c'est la condition pour que le fournisseur reconnaisse la requête et
      // n'envoie pas une seconde fois ce qui serait déjà parti.
      const recipients = [];
      let attempt = 1;
      for (const row of rows) {
        if (row.status !== 'sending') continue;
        const sub = await ctx.db.get(row.subscriptionId);
        await ctx.db.patch(row._id, {
          claimedAt: now,
          attempts: row.attempts + 1,
        });
        attempt = Math.max(attempt, row.attempts + 1);
        recipients.push({
          deliveryId: row._id,
          email: sub?.email ?? '',
          locale: row.locale,
          unsubToken: sub?.unsubToken ?? '',
        });
      }
      return {
        kind: 'batch' as const,
        claimId: stale.claimId,
        attempt,
        recipients,
      };
    }

    const queued = await ctx.db
      .query('newsletterDeliveries')
      .withIndex('by_campaign_and_status', (q) =>
        q.eq('campaignId', campaignId).eq('status', 'queued'),
      )
      .take(Math.max(1, Math.min(100, batchSize)));
    if (queued.length === 0) {
      if (!campaign.enqueueDone) return { kind: 'wait' as const };
      const sent = campaign.recipientCount ?? 0;
      const failed = campaign.failedCount ?? 0;
      await ctx.db.patch(campaignId, {
        status: failed > 0 && sent === 0 ? 'error' : 'sent',
        sentAt: now,
      });
      return { kind: 'done' as const };
    }

    const claimId = `${campaignId}:${queued[0]._id}:${queued[0].attempts}`;
    const recipients = [];
    let skipped = 0;
    for (const row of queued) {
      const sub = await ctx.db.get(row.subscriptionId);
      // Parti entre la mise en file et l'envoi (désinscrit) : on ne lui écrit
      // pas. Le statut le dit, le compteur aussi.
      if (!sub || sub.status !== 'confirmed' || !sub.unsubToken) {
        await ctx.db.patch(row._id, { status: 'skipped' });
        skipped++;
        continue;
      }
      await ctx.db.patch(row._id, {
        status: 'sending',
        claimId,
        claimedAt: now,
        attempts: row.attempts + 1,
      });
      recipients.push({
        deliveryId: row._id,
        email: sub.email,
        locale: sub.locale ?? row.locale,
        unsubToken: sub.unsubToken,
      });
    }
    if (skipped > 0) {
      await ctx.db.patch(campaignId, {
        skippedCount: (campaign.skippedCount ?? 0) + skipped,
      });
    }
    if (recipients.length === 0) return { kind: 'wait' as const };
    return { kind: 'batch' as const, claimId, attempt: 1, recipients };
  },
});

export const _recordResults = internalMutation({
  args: {
    campaignId: v.id('newsletterCampaigns'),
    results: v.array(
      v.object({
        deliveryId: v.id('newsletterDeliveries'),
        ok: v.boolean(),
        providerId: v.optional(v.string()),
        error: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { campaignId, results }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) return null;
    let sent = 0;
    let failed = 0;
    const now = Date.now();
    for (const r of results) {
      const row = await ctx.db.get(r.deliveryId);
      // Déjà tranchée (résultat rejoué après une reprise) : on ne compte pas
      // deux fois.
      if (!row || row.status !== 'sending') continue;
      if (r.ok) {
        await ctx.db.patch(r.deliveryId, {
          status: 'sent',
          sentAt: now,
          providerId: r.providerId,
          error: undefined,
        });
        sent++;
      } else {
        await ctx.db.patch(r.deliveryId, {
          status: 'failed',
          error: r.error?.slice(0, 300),
        });
        failed++;
      }
    }
    await ctx.db.patch(campaignId, {
      recipientCount: (campaign.recipientCount ?? 0) + sent,
      failedCount: (campaign.failedCount ?? 0) + failed,
    });
    return null;
  },
});

// Échec transitoire : le lot reste « en cours » mais son bail est échu tout de
// suite — il sera REPRIS au prochain passage, même `claimId`, donc même clé
// d'idempotence. Au-delà de MAX_TRANSIENT_ATTEMPTS, les lignes passent en
// échec (relançables depuis l'écran).
export const _releaseClaim = internalMutation({
  args: {
    campaignId: v.id('newsletterCampaigns'),
    claimId: v.string(),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { campaignId, claimId, error }) => {
    const rows = await ctx.db
      .query('newsletterDeliveries')
      .withIndex('by_claim', (q) => q.eq('claimId', claimId))
      .collect();
    let failed = 0;
    for (const row of rows) {
      if (row.status !== 'sending') continue;
      if (row.attempts >= MAX_TRANSIENT_ATTEMPTS) {
        await ctx.db.patch(row._id, { status: 'failed', error });
        failed++;
      } else {
        await ctx.db.patch(row._id, { claimedAt: 0, error });
      }
    }
    if (failed > 0) {
      const campaign = await ctx.db.get(campaignId);
      if (campaign) {
        await ctx.db.patch(campaignId, {
          failedCount: (campaign.failedCount ?? 0) + failed,
        });
      }
    }
    return null;
  },
});

// Boucle de livraison : un lot, puis le suivant après la pause dérivée du
// débit configuré. Une seule chaîne par campagne.
export const _processBatch = internalAction({
  args: { campaignId: v.id('newsletterCampaigns') },
  returns: v.null(),
  handler: async (ctx, { campaignId }) => {
    const config = deliveryConfig();
    const claim: Infer<typeof claimResult> = await ctx.runMutation(
      internal.newsletter._claimBatch,
      {
        campaignId,
        batchSize: config.batchSize,
      },
    );
    if (claim.kind === 'done') return null;
    if (claim.kind === 'wait') {
      await ctx.scheduler.runAfter(
        Math.max(config.intervalMs, claim.retryInMs ?? 0),
        internal.newsletter._processBatch,
        { campaignId },
      );
      return null;
    }

    const campaign: CampaignContent | null = await ctx.runQuery(
      internal.newsletter._campaignContent,
      { campaignId },
    );
    if (!campaign) return null;

    const messages = claim.recipients.map((r) => {
      const version = pickVariant(campaign, r.locale);
      return {
        to: r.email,
        subject: version.subject,
        html: campaignHtml(version.body, r.unsubToken, version.locale),
        headers: listUnsubscribeHeaders(r.unsubToken, version.locale),
      };
    });

    try {
      const results = await sendEmailBatch(
        messages,
        idempotencyKey(claim.claimId),
      );
      await ctx.runMutation(internal.newsletter._recordResults, {
        campaignId,
        results: claim.recipients.map((r, i) => {
          const res = results[i];
          return res.ok
            ? { deliveryId: r.deliveryId, ok: true, providerId: res.id }
            : { deliveryId: r.deliveryId, ok: false, error: res.error };
        }),
      });
      await ctx.scheduler.runAfter(
        config.intervalMs,
        internal.newsletter._processBatch,
        { campaignId },
      );
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(
        0,
        300,
      );
      await ctx.runMutation(internal.newsletter._releaseClaim, {
        campaignId,
        claimId: claim.claimId,
        error: message,
      });
      await ctx.scheduler.runAfter(
        err instanceof TransientEmailError
          ? backoffMs(claim.attempt, config.intervalMs)
          : config.intervalMs,
        internal.newsletter._processBatch,
        { campaignId },
      );
    }
    return null;
  },
});

// REPRISE APRÈS ÉCHEC : les destinataires en échec repassent en file et la
// livraison repart. Aucun destinataire déjà servi n'est touché (`sent` n'est
// jamais remis en file) — c'est ce qui garantit l'absence de doublon.
export const retryFailedDeliveries = mutation({
  args: { campaignId: v.id('newsletterCampaigns') },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { campaignId }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) throw new Error('NOT_FOUND');
    if (campaign.status !== 'sent' && campaign.status !== 'error') {
      throw new Error('NOT_RETRYABLE');
    }
    if (emailProviderStatus().mode === 'none') {
      throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
    }
    await ctx.db.patch(campaignId, { status: 'sending', enqueueDone: false });
    await ctx.scheduler.runAfter(0, internal.newsletter._requeueFailed, {
      campaignId,
    });
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.NEWSLETTER_CAMPAIGN_RETRIED,
      targetId: campaignId,
    });
    return { ok: true };
  },
});

export const _requeueFailed = internalMutation({
  args: { campaignId: v.id('newsletterCampaigns') },
  returns: v.null(),
  handler: async (ctx, { campaignId }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.status !== 'sending') return null;
    const failed = await ctx.db
      .query('newsletterDeliveries')
      .withIndex('by_campaign_and_status', (q) =>
        q.eq('campaignId', campaignId).eq('status', 'failed'),
      )
      .take(ENQUEUE_PAGE);
    for (const row of failed) {
      await ctx.db.patch(row._id, {
        status: 'queued',
        claimId: undefined,
        claimedAt: undefined,
        error: undefined,
      });
    }
    const done = failed.length < ENQUEUE_PAGE;
    await ctx.db.patch(campaignId, {
      failedCount: Math.max(0, (campaign.failedCount ?? 0) - failed.length),
      enqueueDone: done,
    });
    await ctx.scheduler.runAfter(
      0,
      done
        ? internal.newsletter._processBatch
        : internal.newsletter._requeueFailed,
      { campaignId },
    );
    return null;
  },
});

// Motifs des échecs d'une campagne (échantillon) — pour que l'éditeur sache
// quoi corriger avant de relancer (clé refusée, domaine non vérifié…).
export const campaignFailures = query({
  args: { campaignId: v.id('newsletterCampaigns') },
  returns: v.array(v.object({ error: v.string(), count: v.number() })),
  handler: async (ctx, { campaignId }) => {
    await requireNetworkRole(ctx, 'editeur');
    const rows = await ctx.db
      .query('newsletterDeliveries')
      .withIndex('by_campaign_and_status', (q) =>
        q.eq('campaignId', campaignId).eq('status', 'failed'),
      )
      .take(200);
    const byError = new Map<string, number>();
    for (const r of rows) {
      const key = r.error ?? '—';
      byError.set(key, (byError.get(key) ?? 0) + 1);
    }
    return [...byError.entries()]
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  },
});

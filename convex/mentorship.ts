import { v } from 'convex/values';
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
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { assertTransition, type ReviewMachine } from './lib/reviewState';
import { locale } from './schema';
import type { Doc } from './_generated/dataModel';

// --- Mentorat : mise en relation (F-59) -------------------------------------
// Rend réelle l'intention « Demander un mentor » / « Trouver mon mentor » du hub
// Jeunes. Sans compte (par e-mail, comme la candidature F-58). On s'inscrit
// comme « mentore » (cherche un mentor) ou « mentor » (propose son aide).
// Rate-limitée ; dédoublonnage doux : une demande en attente par (e-mail, rôle).
// Portail anti-spam : l'action vérifie reCAPTCHA v3 puis délègue à
// `storeRequest` (internalMutation -> non contournable).
export const requestMentorship = action({
  args: {
    name: v.string(),
    email: v.string(),
    country: v.string(),
    role: v.union(v.literal('mentore'), v.literal('mentor')),
    themes: v.optional(v.array(v.string())),
    message: v.string(),
    locale: v.optional(locale),
    captchaToken: v.optional(v.string()),
  },
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'mentorship');
    // ORACLE D'EXISTENCE REFERMÉ (pentest M-8, audit F-09).
    //
    // La mutation interne distingue toujours « déjà connu » de « nouveau » —
    // elle en a besoin pour ne pas dupliquer ni recompter. Mais cette
    // distinction ne FRANCHIT PLUS la frontière publique : cette action est
    // ouverte, non authentifiée, et rendait `already: true/false`. Une seule
    // requête suffisait donc pour savoir si une adresse donnée figure dans nos
    // listes — appartenance à un réseau militant, inscription à un événement.
    // Les plafonds par IP et par formulaire ralentissent l'énumération ; ils
    // ne changent rien à une vérification ciblée, qui ne coûte qu'un appel.
    //
    // La réponse est désormais IDENTIQUE dans les deux cas. Rien n'est perdu
    // côté produit : aucun formulaire ne lisait `already` — tous affichent le
    // même message de succès (vérifié sur les cinq).
    await ctx.runMutation(internal.mentorship.storeRequest, input);
    return { ok: true };
  },
});

export const storeRequest = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    country: v.string(),
    role: v.union(v.literal('mentore'), v.literal('mentor')),
    themes: v.optional(v.array(v.string())),
    message: v.string(),
    locale: v.optional(locale),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    const country = args.country.trim();
    const message = args.message.trim();
    if (name.length < 2 || name.length > 120) throw new Error('INVALID_NAME');
    if (!isEmail(email)) throw new Error('INVALID_EMAIL');
    if (country.length < 2) throw new Error('INVALID_COUNTRY');
    if (message.length < 10 || message.length > 4000) {
      throw new Error('INVALID_MESSAGE');
    }

    // Plafonds NON FORGEABLES (audit M2) — par IP et global par formulaire :
    // changer d'adresse ne rend plus un quota neuf. Cf. lib/rateLimit.ts.
    await enforcePublicFormLimit(ctx, 'mentorship');

    await enforceRateLimit(ctx, {
      key: `mentorship:${email}`,
      ...RATE_LIMITS.apply,
    });

    // Dédoublonnage doux : une demande pending par (email, role). On peut donc
    // s'inscrire à la fois comme mentoré ET mentor, mais pas deux fois dans le
    // même rôle tant que la première est en attente.
    const existing = await ctx.db
      .query('mentorshipRequests')
      .withIndex('by_email', (q) => q.eq('email', email))
      .collect();
    if (existing.some((m) => m.status === 'pending' && m.role === args.role)) {
      return { ok: true, already: true };
    }

    await ctx.db.insert('mentorshipRequests', {
      name,
      email,
      country,
      role: args.role,
      themes: args.themes?.length ? args.themes : undefined,
      message,
      locale: args.locale,
      status: 'pending',
      createdAt: Date.now(),
    });
    return { ok: true, already: false };
  },
});

// --- Back-office (modérateur et au-dessus) ----------------------------------
export const listMentorshipRequests = query({
  // Domaine FERMÉ (miroir du schéma) : le back-office ne propose que ces
  // valeurs, le validateur les impose. Sans filtre -> toute la file.
  args: {
    status: v.optional(
      v.union(v.literal('pending'), v.literal('matched'), v.literal('closed')),
    ),
  },
  handler: async (ctx, { status }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const all = status
      ? await ctx.db
          .query('mentorshipRequests')
          .withIndex('by_status', (q) => q.eq('status', status))
          .collect()
      : await ctx.db.query('mentorshipRequests').collect();
    return all
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((m) => ({
        _id: m._id,
        name: m.name,
        email: m.email,
        country: m.country,
        role: m.role,
        themes: m.themes ?? [],
        message: m.message,
        status: m.status,
        createdAt: m.createdAt,
      }));
  },
});

// --- Machine à états de la revue des demandes de mentorat (issue #9) -------
//
//   pending ──matched/closed──► matched | closed
//   matched ──closed──► closed                  (fin d'accompagnement)
//   matched | closed ──reopenMentorshipRequest──► pending
//
// `matched -> closed` est une SUITE, pas une inversion : la mise en relation a
// bien eu lieu, puis l'accompagnement se termine. L'inverse — `closed` repassé
// en `matched` — prétendrait qu'un appariement existe alors qu'il a été clos ;
// il faut d'abord rouvrir la demande.
//
// Effet de bord de la décision : AUCUN (ni compte, ni rôle, ni mise en relation
// automatique — l'appariement se fait par e-mail, hors de l'outil). La garde
// protège donc le JOURNAL : ces mutations sont auditées, et une décision
// rejouée ou inversée en silence y empile des lignes contradictoires.
const MENTORSHIP_REVIEW: ReviewMachine<Doc<'mentorshipRequests'>['status']> = {
  transitions: {
    pending: ['matched', 'closed'],
    matched: ['closed', 'pending'],
    closed: ['pending'],
  },
  decided: ['matched', 'closed'],
};

export const reviewMentorshipRequest = mutation({
  args: {
    requestId: v.id('mentorshipRequests'),
    status: v.union(v.literal('matched'), v.literal('closed')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { requestId, status, notes }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('NOT_FOUND');
    assertTransition(request.status, status, MENTORSHIP_REVIEW);

    await ctx.db.patch(requestId, {
      status,
      reviewedBy: reviewer._id,
      reviewedAt: Date.now(),
    });
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.MENTORSHIP_REVIEWED,
      targetId: requestId,
      metadata: {
        status,
        role: request.role,
        notes: notes?.trim() || undefined,
      },
    });
    return { ok: true };
  },
});

// Réouverture d'une demande tranchée (issue #9) — modérateur et au-dessus,
// audité sous sa propre action. C'est le seul chemin de retour : un
// appariement clos qu'on veut reprendre repasse par la file, visiblement.
export const reopenMentorshipRequest = mutation({
  args: { requestId: v.id('mentorshipRequests') },
  handler: async (ctx, { requestId }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('NOT_FOUND');
    const from = request.status;
    assertTransition(from, 'pending', MENTORSHIP_REVIEW);

    await ctx.db.patch(requestId, { status: 'pending' });
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.MENTORSHIP_REOPENED,
      targetId: requestId,
      metadata: { from, role: request.role },
    });
    return { ok: true };
  },
});

// DEV/TEST seulement (garde AUTH_DEV_OTP) : vérifie le stockage réel en E2E.
export const isMentorshipRequested = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const rows = await ctx.db
      .query('mentorshipRequests')
      .withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
      .collect();
    return rows.length > 0;
  },
});

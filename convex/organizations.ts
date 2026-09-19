import { v } from 'convex/values';
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { getAuthUserId } from '@convex-dev/auth/server';
import { enforceRecaptcha } from './lib/recaptcha';
import { requireNetworkRole, rank } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { matchesFilters, computeFacets } from './lib/directory';
import { isEmail } from './lib/validation';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';

// Annuaire public des think tanks (F-19) : liste filtrée + facettes calculées
// sur l'ensemble des membres actifs (pour ne proposer que des filtres utiles).
// Rendu côté serveur, filtres dans l'URL -> SEO + faible débit (F-05/F-07).
export const listDirectory = query({
  args: {
    region: v.optional(v.string()),
    theme: v.optional(v.string()),
    q: v.optional(v.string()),
  },
  handler: async (ctx, { region, theme, q }) => {
    const active = await ctx.db
      .query('organizations')
      .withIndex('by_status', (qi) => qi.eq('status', 'active'))
      .collect();
    const items = active
      .filter((o) => matchesFilters(o, { region, theme, q }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { items, facets: computeFacets(active), total: active.length };
  },
});

// Fiche membre (F-21) — publique : ne renvoie QUE les organisations actives.
// Le filtrage de statut vit dans la query (et non chez l'appelant) pour qu'aucun
// consommateur ne puisse exposer une fiche pending/suspended.
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    return org && org.status === 'active' ? org : null;
  },
});

// Candidature d'adhésion (F-22) — ouverte au public ; on lie l'utilisateur
// connecté. Valide côté serveur (défense en profondeur, l'UI valide aussi).
//
// Portail anti-spam : l'action vérifie reCAPTCHA v3 puis délègue à
// `storeApplication` (internalMutation). L'identité de l'utilisateur connecté
// est propagée à travers ctx.runMutation -> la liaison applicantUserId tient.
export const submitApplication = action({
  args: {
    type: v.union(v.literal('organisation'), v.literal('individu')),
    organizationName: v.string(),
    contactEmail: v.string(),
    country: v.string(),
    message: v.optional(v.string()),
    captchaToken: v.optional(v.string()),
  },
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'membership');
    // Annotation explicite : casse la circularité de type TS (cf. guidelines).
    const id: Id<'membershipApplications'> = await ctx.runMutation(
      internal.organizations.storeApplication,
      input,
    );
    return id;
  },
});

export const storeApplication = internalMutation({
  args: {
    type: v.union(v.literal('organisation'), v.literal('individu')),
    organizationName: v.string(),
    contactEmail: v.string(),
    country: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const organizationName = args.organizationName.trim();
    const contactEmail = args.contactEmail.trim();
    const country = args.country.trim();
    const message = args.message?.trim() || undefined;

    if (organizationName.length < 2) throw new Error('INVALID_NAME');
    if (!isEmail(contactEmail)) throw new Error('INVALID_EMAIL');
    if (country.length < 2) throw new Error('INVALID_COUNTRY');

    await enforceRateLimit(ctx, {
      key: `apply:${contactEmail.toLowerCase()}`,
      ...RATE_LIMITS.apply,
    });

    const userId = await getAuthUserId(ctx);
    return await ctx.db.insert('membershipApplications', {
      type: args.type,
      organizationName,
      contactEmail,
      country,
      message,
      status: 'pending',
      submittedAt: Date.now(),
      ...(userId ? { applicantUserId: userId } : {}),
    });
  },
});

// DEV/TEST seulement (garde AUTH_DEV_OTP) : relit la dernière candidature d'une
// adresse, pour que l'E2E vérifie le stockage réel (cf. otp.latestDevCode).
export const latestApplicationForEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const all = await ctx.db
      .query('membershipApplications')
      .order('desc')
      .collect();
    const a = all.find((x) => x.contactEmail === email);
    return a
      ? {
          organizationName: a.organizationName,
          type: a.type,
          status: a.status,
          country: a.country,
        }
      : null;
  },
});

// Validation d'une candidature (F-22 / F-26) — modérateur et au-dessus, audité.
export const reviewApplication = mutation({
  args: {
    applicationId: v.id('membershipApplications'),
    decision: v.union(v.literal('approved'), v.literal('rejected')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { applicationId, decision, notes }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const application = await ctx.db.get(applicationId);
    if (!application) throw new Error('NOT_FOUND');

    await ctx.db.patch(applicationId, {
      status: decision,
      reviewedBy: reviewer._id,
      reviewNotes: notes,
      reviewedAt: Date.now(),
    });

    // Modèle d'adhésion B : approuver une candidature liée à un compte élève ce
    // compte au rôle « membre » (sans jamais rétrograder un rôle supérieur) —
    // c'est ce qui débloque le dépôt de publications.
    if (decision === 'approved' && application.applicantUserId) {
      const applicant = await ctx.db.get(application.applicantUserId);
      if (applicant && rank(applicant.role) < rank('membre')) {
        await ctx.db.patch(applicant._id, { role: 'membre' });
        await recordAudit(ctx, {
          actorId: reviewer._id,
          action: AUDIT.USER_ROLE_CHANGED,
          targetId: applicant._id,
          metadata: { role: 'membre', via: 'membership' },
        });
      }
    }

    // Notifie le candidat de l'issue de sa demande d'adhésion (F-25/F-51).
    if (application.applicantUserId) {
      await notify(ctx, {
        userId: application.applicantUserId,
        type:
          decision === 'approved'
            ? 'membership_approved'
            : 'membership_rejected',
        titleKey:
          decision === 'approved'
            ? 'membershipApproved'
            : 'membershipRejected',
        link: decision === 'approved' ? '/espace-membre' : '/adhesion',
      });
    }

    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.MEMBERSHIP_REVIEWED,
      targetId: applicationId,
      metadata: { decision },
    });
  },
});

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
import { locale } from './schema';

// --- Candidature publique au hub Jeunes (F-58) ------------------------------
// Sans compte (par e-mail), comme l'adhésion. Rate-limitée ; une candidature en
// attente par e-mail (dédoublonnage doux) pour éviter les envois multiples.
// Portail anti-spam : l'action vérifie reCAPTCHA v3 puis délègue à
// `storeApplication` (internalMutation -> non contournable).
export const applyYouth = action({
  args: {
    name: v.string(),
    email: v.string(),
    country: v.string(),
    themes: v.optional(v.array(v.string())),
    motivation: v.string(),
    locale: v.optional(locale),
    captchaToken: v.optional(v.string()),
  },
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'youth_apply');
    const result: { ok: boolean; already: boolean } = await ctx.runMutation(
      internal.youth.storeApplication,
      input,
    );
    return result;
  },
});

export const storeApplication = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    country: v.string(),
    themes: v.optional(v.array(v.string())),
    motivation: v.string(),
    locale: v.optional(locale),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    const country = args.country.trim();
    const motivation = args.motivation.trim();
    if (name.length < 2 || name.length > 120) throw new Error('INVALID_NAME');
    if (!isEmail(email)) throw new Error('INVALID_EMAIL');
    if (country.length < 2) throw new Error('INVALID_COUNTRY');
    if (motivation.length < 10 || motivation.length > 4000) {
      throw new Error('INVALID_MOTIVATION');
    }

    // Plafonds NON FORGEABLES (audit M2) — par IP et global par formulaire :
    // changer d'adresse ne rend plus un quota neuf. Cf. lib/rateLimit.ts.
    await enforcePublicFormLimit(ctx, 'youthApply');

    await enforceRateLimit(ctx, {
      key: `youthApply:${email}`,
      ...RATE_LIMITS.apply,
    });

    const existing = await ctx.db
      .query('youthApplications')
      .withIndex('by_email', (q) => q.eq('email', email))
      .collect();
    if (existing.some((a) => a.status === 'pending')) {
      return { ok: true, already: true };
    }

    await ctx.db.insert('youthApplications', {
      name,
      email,
      country,
      themes: args.themes?.length ? args.themes : undefined,
      motivation,
      locale: args.locale,
      status: 'pending',
      createdAt: Date.now(),
    });
    return { ok: true, already: false };
  },
});

// --- Back-office (modérateur et au-dessus) ----------------------------------
export const listYouthApplications = query({
  // Domaine FERMÉ (miroir du schéma) : le back-office ne propose que ces
  // valeurs, le validateur les impose. Sans filtre -> toute la file.
  args: {
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('approved'),
        v.literal('rejected'),
      ),
    ),
  },
  handler: async (ctx, { status }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const all = status
      ? await ctx.db
          .query('youthApplications')
          .withIndex('by_status', (q) => q.eq('status', status))
          .collect()
      : await ctx.db.query('youthApplications').collect();
    return all
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((a) => ({
        _id: a._id,
        name: a.name,
        email: a.email,
        country: a.country,
        themes: a.themes ?? [],
        motivation: a.motivation,
        status: a.status,
        createdAt: a.createdAt,
      }));
  },
});

export const reviewYouthApplication = mutation({
  args: {
    applicationId: v.id('youthApplications'),
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
      reviewNotes: notes?.trim() || undefined,
      reviewedAt: Date.now(),
    });
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.YOUTH_REVIEWED,
      targetId: applicationId,
      metadata: { decision },
    });
    return { ok: true };
  },
});

// DEV/TEST seulement (garde AUTH_DEV_OTP) : vérifie le stockage réel en E2E.
export const isYouthApplicant = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const rows = await ctx.db
      .query('youthApplications')
      .withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
      .collect();
    return rows.length > 0;
  },
});

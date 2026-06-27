import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { isEmail } from './lib/validation';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { requireNetworkRole } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { locale } from './schema';

// --- Mentorat : mise en relation (F-59) -------------------------------------
// Rend réelle l'intention « Demander un mentor » / « Trouver mon mentor » du hub
// Jeunes. Sans compte (par e-mail, comme la candidature F-58). On s'inscrit
// comme « mentore » (cherche un mentor) ou « mentor » (propose son aide).
// Rate-limitée ; dédoublonnage doux : une demande en attente par (e-mail, rôle).
export const requestMentorship = mutation({
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
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const all =
      status === 'pending' || status === 'matched' || status === 'closed'
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

    await ctx.db.patch(requestId, {
      status,
      reviewedBy: reviewer._id,
      reviewedAt: Date.now(),
    });
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.MENTORSHIP_REVIEWED,
      targetId: requestId,
      metadata: { status, role: request.role, notes: notes?.trim() || undefined },
    });
    return { ok: true };
  },
});

// DEV/TEST seulement (garde AUTH_DEV_OTP) : vérifie le stockage réel en E2E.
export const isMentorshipRequested = query({
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

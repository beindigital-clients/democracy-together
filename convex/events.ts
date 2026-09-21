import { v } from 'convex/values';
import {
  action,
  internalMutation,
  internalQuery,
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
import { COUNTER, bumpCounter } from './lib/counters';
import { locale } from './schema';

// --- Inscription publique à un événement (F-53) -----------------------------
// RSVP en ligne. `eventSlug` provient du module Next `events-content.ts` ; on ne
// valide pas son existence côté serveur (pas de table événements) mais on borne
// la chaîne. Idempotent : une même adresse réinscrite au même event ne crée pas
// de doublon. Rate-limité par adresse.
// Portail anti-spam : l'action vérifie reCAPTCHA v3 puis délègue à
// `storeRegistration` (internalMutation -> non contournable).
export const registerForEvent = action({
  args: {
    eventSlug: v.string(),
    name: v.string(),
    email: v.string(),
    organization: v.optional(v.string()),
    locale: v.optional(locale),
    captchaToken: v.optional(v.string()),
  },
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'event_register');
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
    await ctx.runMutation(internal.events.storeRegistration, input);
    return { ok: true };
  },
});

export const storeRegistration = internalMutation({
  args: {
    eventSlug: v.string(),
    name: v.string(),
    email: v.string(),
    organization: v.optional(v.string()),
    locale: v.optional(locale),
  },
  handler: async (ctx, args) => {
    const eventSlug = args.eventSlug.trim();
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    if (!eventSlug || eventSlug.length > 100) throw new Error('INVALID_EVENT');
    if (name.length < 2 || name.length > 120) throw new Error('INVALID_NAME');
    if (!isEmail(email)) throw new Error('INVALID_EMAIL');

    // Plafonds NON FORGEABLES (audit M2) — par IP et global par formulaire :
    // changer d'adresse ne rend plus un quota neuf. Cf. lib/rateLimit.ts.
    await enforcePublicFormLimit(ctx, 'eventRegister');

    await enforceRateLimit(ctx, {
      key: `eventRegister:${email}`,
      ...RATE_LIMITS.eventRegister,
    });

    const existing = await ctx.db
      .query('eventRegistrations')
      .withIndex('by_event_and_email', (q) =>
        q.eq('eventSlug', eventSlug).eq('email', email),
      )
      .unique();
    if (existing) return { ok: true, already: true };

    await ctx.db.insert('eventRegistrations', {
      eventSlug,
      name,
      email,
      organization: args.organization?.trim() || undefined,
      locale: args.locale,
      createdAt: Date.now(),
    });
    await bumpCounter(ctx, COUNTER.EVENT_REGISTRATIONS, 1);
    return { ok: true, already: false };
  },
});

// --- Back-office : liste des inscriptions (modérateur et au-dessus) ----------
export const listEventRegistrations = query({
  args: {},
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'moderateur');
    const all = await ctx.db.query('eventRegistrations').collect();
    return all
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        _id: r._id,
        eventSlug: r.eventSlug,
        name: r.name,
        email: r.email,
        organization: r.organization ?? null,
        createdAt: r.createdAt,
      }));
  },
});

// DEV/TEST seulement (garde AUTH_DEV_OTP) : vérifie le stockage réel en E2E.
export const isRegistered = internalQuery({
  args: { eventSlug: v.string(), email: v.string() },
  handler: async (ctx, { eventSlug, email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const reg = await ctx.db
      .query('eventRegistrations')
      .withIndex('by_event_and_email', (q) =>
        q
          .eq('eventSlug', eventSlug.trim())
          .eq('email', email.trim().toLowerCase()),
      )
      .unique();
    return Boolean(reg);
  },
});

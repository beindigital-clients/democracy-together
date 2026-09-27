import { v, ConvexError } from 'convex/values';
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from './_generated/server';
import { internal } from './_generated/api';
import { isEmail } from './lib/validation';

// ÉVÉNEMENTS OUVERTS À L'INSCRIPTION — catalogue partagé MINIMAL (A-03).
//
// Le 27/09, l'inscription à un événement PASSÉ (« IA générative et intégrité
// de l'information », 4 juin 2026) était acceptée et stockée : la fiche
// affichait le formulaire, et ce backend ne connaît pas les dates. La fiche
// masque désormais le formulaire ; mais l'action est publique, et un appel
// direct la contournait. D'où ce refus côté serveur.
//
// POURQUOI UNE LISTE DE SLUGS ET PAS LES ÉVÉNEMENTS. Le catalogue vit dans
// `src/lib/events-content.ts` (2 300 lignes de libellés en cinq langues),
// que ce bundle ne peut pas importer : il n'a ni l'alias `@/` ni de raison
// d'embarquer les titres. Dupliquer les dates créerait deux sources de
// vérité ; recopier les SEULS slugs des événements à venir est le minimum
// qui rende le refus possible. `convex/events.test.ts` rapproche cette liste
// des `upcoming: true` du catalogue Next à chaque exécution : elle ne peut
// pas dériver en silence. Quand un événement passe, retirer son slug ici EN
// MÊME TEMPS que `upcoming: false` là-bas — le test le rappelle.
export const UPCOMING_EVENT_SLUGS: readonly string[] = [
  'conference-inaugurale',
  'webinaire-gouvernance-plateformes',
  'atelier-dakar-transparence-budgetaire',
  'atelier-bruxelles-democratie-ue',
  'webinaire-jeunes-releve',
  'atelier-dakar-integrite-electorale',
  'webinaire-desinformation-confiance',
  'atelier-bruxelles-souverainete-numerique',
  'webinaire-financer-societe-civile',
  'restitution-barometre-annuel',
];

export function isEventOpenForRegistration(slug: string): boolean {
  return UPCOMING_EVENT_SLUGS.includes(slug);
}
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
// RSVP en ligne. `eventSlug` provient du module Next `events-content.ts` ; il
// n'y a pas de table événements, mais le slug est confronté à la liste des
// événements OUVERTS (`UPCOMING_EVENT_SLUGS`, ci-dessus) : un événement passé
// ou inconnu est refusé (A-03). Idempotent : une même adresse réinscrite au
// même event ne crée pas de doublon. Rate-limité par adresse.
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
    // Événement passé, ou inconnu du catalogue : inscription fermée (A-03).
    // `ConvexError` pour que le formulaire dise « inscriptions closes » plutôt
    // qu'un échec générique.
    if (!isEventOpenForRegistration(eventSlug))
      throw new ConvexError('EVENT_CLOSED');
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

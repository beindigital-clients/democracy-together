import { v, ConvexError } from 'convex/values';
import {
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from './_generated/server';
import { internal } from './_generated/api';
import { isEmail } from './lib/validation';
import {
  enforcePublicFormLimit,
  enforceRateLimit,
  RATE_LIMITS,
} from './lib/rateLimit';
import { enforceRecaptcha } from './lib/recaptcha';
import { sendEmail } from './email';
import { eventReminderEmail, eventVisioEmail } from './lib/emailContent';
import { locale } from './schema';
import { findEventBySlug, requireOpenEvent } from './lib/contenus/events';
import { pickText } from './lib/contenus/i18n';

// Rappels d'événements par e-mail (F-55). Un visiteur — sans compte — demande à
// être prévenu avant un événement à venir. La demande est stockée (sent:false) ;
// un cron quotidien (convex/crons.ts) déclenche `sendDueReminders`, qui envoie
// les rappels dont la date approche puis les marque `sent:true`. L'envoi réel
// passe par l'adaptateur générique `sendEmail` (convex/email.ts) : sans clé
// fournisseur (dev/test) c'est un NO-OP — aucun e-mail réel n'est émis. Voulu.

// Fenêtre d'envoi : on prévient au plus 2 jours avant l'événement.
const REMINDER_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

// Rappels EN ATTENTE tolérés pour une même adresse (pentest M-5). Détail du
// raisonnement et de la mesure dans `storeReminder`.
const MAX_PENDING_REMINDERS_PER_EMAIL = 5;

// VALIDATION CONTRE LA TABLE (pentest M-5, refermé par le chantier
// « contenus »). Le pentest demandait de « valider eventSlug contre la liste
// réelle et calculer eventDate côté serveur » ; le backend ne connaissait pas
// les événements, qui vivaient dans le dépôt Next. Ils sont désormais dans
// `contentEvents` : le slug est confronté à la table (inconnu, brouillon,
// annulé ou passé -> `EVENT_CLOSED`) et la date du rappel est le `startsAt`
// de l'événement. L'argument `eventDate` reste ACCEPTÉ pour ne pas casser un
// client en cache, mais il est IGNORÉ.

// --- Demande publique de rappel (F-55) --------------------------------------
// Sans compte (comme l'inscription F-53). Valide l'e-mail, borne le slug,
// rate-limite par adresse (réutilise RATE_LIMITS.apply), dédoublonne par
// (eventSlug, email) : redemander = succès idempotent, pas de doublon.
// Portail anti-spam : l'action vérifie reCAPTCHA v3 (le rappel part en e-mail
// vers une adresse fournie par l'appelant -> vecteur d'abus) puis délègue à
// `storeReminder` (internalMutation -> non contournable).
export const requestReminder = action({
  args: {
    eventSlug: v.string(),
    email: v.string(),
    // Ignoré : la date vient de la table (cf. en-tête).
    eventDate: v.optional(v.number()),
    locale: v.optional(locale),
    captchaToken: v.optional(v.string()),
  },
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'event_reminder');
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
    await ctx.runMutation(internal.eventReminders.storeReminder, input);
    return { ok: true };
  },
});

export const storeReminder = internalMutation({
  args: {
    eventSlug: v.string(),
    email: v.string(),
    eventDate: v.optional(v.number()),
    locale: v.optional(locale),
  },
  handler: async (ctx, args) => {
    const eventSlug = args.eventSlug.trim();
    const email = args.email.trim().toLowerCase();
    if (!eventSlug || eventSlug.length > 100) throw new Error('INVALID_EVENT');
    if (!isEmail(email)) throw new Error('INVALID_EMAIL');

    // PLAFOND DE RAPPELS NON ENVOYÉS PAR ADRESSE (pentest M-5).
    //
    // Ce que la mesure a montré, PoC à l'appui : le dédoublonnage porte sur
    // (eventSlug, email), et le slug n'est pas validé contre les événements
    // réels — seulement borné à 100 caractères. Varier le slug rendait donc un
    // créneau neuf à chaque fois, et cinq rappels vers une adresse TIERCE
    // étaient enregistrés avant que le plafond horaire ne morde. Ce plafond-là
    // se reconstitue : cinq de plus l'heure suivante, cent vingt par jour, tous
    // partant du domaine du site à 07:00 UTC.
    //
    // Le plafond ci-dessous ne se reconstitue pas tout seul : il compte les
    // rappels EN ATTENTE. Une fois la file pleine pour une adresse, plus rien
    // n'y entre tant qu'ils n'ont pas été envoyés. Cinq est large pour un
    // usage humain — il y a moins d'événements à venir que cela.
    const enAttente = await ctx.db
      .query('eventReminders')
      .withIndex('by_email_and_sent', (q) =>
        q.eq('email', email).eq('sent', false),
      )
      .collect();
    if (enAttente.length >= MAX_PENDING_REMINDERS_PER_EMAIL) {
      throw new Error('TOO_MANY_PENDING_REMINDERS');
    }

    // L'événement doit exister, être publié et À VENIR — un rappel pour un
    // événement commencé ne partirait jamais. La date du rappel est la sienne.
    const maintenant = Date.now();
    const event = await requireOpenEvent(ctx, eventSlug, maintenant);
    if (event.startsAt < maintenant) throw new ConvexError('EVENT_CLOSED');
    const eventDate = event.startsAt;

    // Plafonds NON FORGEABLES (audit M2) — par IP et global par formulaire :
    // changer d'adresse ne rend plus un quota neuf. Cf. lib/rateLimit.ts.
    await enforcePublicFormLimit(ctx, 'eventReminder');

    await enforceRateLimit(ctx, {
      key: `eventReminder:${email}`,
      ...RATE_LIMITS.apply,
    });

    const existing = await ctx.db
      .query('eventReminders')
      .withIndex('by_event_and_email', (q) =>
        q.eq('eventSlug', eventSlug).eq('email', email),
      )
      .unique();
    if (existing) return { ok: true, already: true };

    await ctx.db.insert('eventReminders', {
      eventSlug,
      email,
      locale: args.locale,
      eventDate,
      sent: false,
      createdAt: Date.now(),
    });
    return { ok: true, already: false };
  },
});

// --- Interne : envoi des rappels dont la date approche ----------------------
// Récupère les rappels non envoyés dont `eventDate` tombe dans [maintenant,
// maintenant + 2 jours]. Le filtrage de fenêtre se fait en mémoire (la table
// reste petite) ; l'index by_sent borne la lecture aux rappels en attente.
//
// L'événement est relu dans la table : un rappel dont l'événement a été
// ANNULÉ ou dépublié entre-temps ne part pas (il est écarté, pas marqué — si
// l'événement est republié, il repartira), et le courriel porte le fuseau du
// lieu, sans lequel une journée à Paris s'annonçait la veille en UTC.
export const _dueReminders = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const pending = await ctx.db
      .query('eventReminders')
      .withIndex('by_sent', (q) => q.eq('sent', false))
      .take(2000);
    const horizon = now + REMINDER_WINDOW_MS;
    const out = [];
    for (const r of pending) {
      if (r.eventDate < now || r.eventDate > horizon) continue;
      const event = await findEventBySlug(ctx, r.eventSlug);
      if (!event || event.status !== 'published') continue;
      out.push({ ...r, timeZone: event.timezone });
    }
    return out;
  },
});

export const _markSent = internalMutation({
  args: { id: v.id('eventReminders') },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { sent: true });
  },
});

// --- Interne : lien de visioconférence aux inscrits (F-54) ------------------
// Le lien d'une salle virtuelle n'est jamais public. Un inscrit connecté le
// lit sur la fiche (`contenus/events:myVisioAccess`) ; tout inscrit — avec ou
// sans compte — le reçoit par courriel dans les deux jours qui précèdent
// l'événement. `visioSentAt` garantit un envoi unique par inscription.
export const _dueVisioLinks = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const events = await ctx.db
      .query('contentEvents')
      .withIndex('by_status_and_startsAt', (q) =>
        q
          .eq('status', 'published')
          .gte('startsAt', now)
          .lte('startsAt', now + REMINDER_WINDOW_MS),
      )
      .take(100);
    const out = [];
    for (const event of events) {
      const visioUrl = event.visioUrl;
      if (!visioUrl) continue;
      const regs = await ctx.db
        .query('eventRegistrations')
        .withIndex('by_event_and_email', (q) => q.eq('eventSlug', event.slug))
        .take(5000);
      for (const r of regs) {
        if (r.visioSentAt !== undefined) continue;
        const loc = r.locale ?? 'fr';
        out.push({
          registrationId: r._id,
          email: r.email,
          locale: loc,
          eventSlug: event.slug,
          eventTitle: pickText(event.title, loc),
          eventDate: event.startsAt,
          timeZone: event.timezone,
          visioUrl,
        });
      }
    }
    return out;
  },
});

export const _markVisioSent = internalMutation({
  args: { id: v.id('eventRegistrations') },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { visioSentAt: Date.now() });
  },
});

// Action planifiée (cron quotidien). Les appels e-mail externes vivent dans une
// action, jamais dans une mutation. Pour chaque rappel dû : sendEmail (NO-OP
// sans clé), puis marquage sent:true via une mutation interne. Même passage
// pour les liens de visioconférence des inscrits.
export const sendDueReminders = internalAction({
  args: {},
  // Type de retour annoté explicitement : `handler` référence
  // `internal.eventReminders.*`, dont les types dépendent de l'API générée de
  // ce fichier — sans annotation, TS boucle (inférence circulaire).
  handler: async (ctx): Promise<{ processed: number; visio: number }> => {
    const now = Date.now();
    const siteUrl =
      process.env.SITE_URL ?? 'https://democracy-together.vercel.app';
    const due = await ctx.runQuery(internal.eventReminders._dueReminders, {
      now,
    });
    for (const r of due) {
      // La ligne portait DÉJÀ la langue du demandeur ; elle ne servait qu'à
      // construire l'URL. Le sujet, le corps et le format de date restaient
      // français — y compris pour quelqu'un qui avait demandé son rappel depuis
      // la version arabe du site.
      const loc = r.locale ?? 'fr';
      try {
        const { subject, html } = eventReminderEmail({
          eventSlug: r.eventSlug,
          eventDate: r.eventDate,
          timeZone: r.timeZone,
          siteUrl,
          locale: loc,
        });
        await sendEmail({ to: r.email, subject, html });
      } catch {
        // L'envoi a échoué (fournisseur indisponible) : on NE marque PAS sent,
        // le prochain passage du cron retentera.
        continue;
      }
      await ctx.runMutation(internal.eventReminders._markSent, { id: r._id });
    }

    const visio = await ctx.runQuery(internal.eventReminders._dueVisioLinks, {
      now,
    });
    for (const r of visio) {
      try {
        const { subject, html } = eventVisioEmail({
          eventSlug: r.eventSlug,
          eventTitle: r.eventTitle,
          eventDate: r.eventDate,
          timeZone: r.timeZone,
          visioUrl: r.visioUrl,
          siteUrl,
          locale: r.locale,
        });
        await sendEmail({ to: r.email, subject, html });
      } catch {
        continue;
      }
      await ctx.runMutation(internal.eventReminders._markVisioSent, {
        id: r.registrationId,
      });
    }
    return { processed: due.length, visio: visio.length };
  },
});

// DEV/TEST seulement (garde AUTH_DEV_OTP) : vérifie le stockage réel en E2E.
export const isReminderSet = internalQuery({
  args: { eventSlug: v.string(), email: v.string() },
  handler: async (ctx, { eventSlug, email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const r = await ctx.db
      .query('eventReminders')
      .withIndex('by_event_and_email', (q) =>
        q
          .eq('eventSlug', eventSlug.trim())
          .eq('email', email.trim().toLowerCase()),
      )
      .unique();
    return Boolean(r);
  },
});

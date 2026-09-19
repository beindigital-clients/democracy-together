import { v } from 'convex/values';
import {
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from './_generated/server';
import { internal } from './_generated/api';
import { isEmail } from './lib/validation';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { enforceRecaptcha } from './lib/recaptcha';
import { sendEmail } from './email';
import { locale } from './schema';

// Rappels d'événements par e-mail (F-55). Un visiteur — sans compte — demande à
// être prévenu avant un événement à venir. La demande est stockée (sent:false) ;
// un cron quotidien (convex/crons.ts) déclenche `sendDueReminders`, qui envoie
// les rappels dont la date approche puis les marque `sent:true`. L'envoi réel
// passe par l'adaptateur générique `sendEmail` (convex/email.ts) : sans clé
// fournisseur (dev/test) c'est un NO-OP — aucun e-mail réel n'est émis. Voulu.

// Fenêtre d'envoi : on prévient au plus 2 jours avant l'événement.
const REMINDER_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Corps de rappel — simple, en français (comme l'OTP / la newsletter).
function reminderHtml(eventSlug: string, eventDate: number, loc: string): string {
  const site = process.env.SITE_URL ?? 'https://democracy-together.vercel.app';
  const url = `${site}/${loc}/evenements/${encodeURIComponent(eventSlug)}`;
  const when = new Intl.DateTimeFormat('fr', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(eventDate);
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;color:#16191f">
    <h2 style="font-family:Georgia,serif;color:#1f3d6e">Democracy Together</h2>
    <p>Vous aviez demandé un rappel pour un événement à venir.</p>
    <p>Il a lieu le <strong>${escapeHtml(when)}</strong>. Retrouvez les informations pratiques et confirmez votre présence&nbsp;:</p>
    <p><a href="${url}">${escapeHtml(url)}</a></p>
    <hr style="border:none;border-top:1px solid #d9d6cd;margin:24px 0"/>
    <p style="color:#646771;font-size:12px">Vous recevez cet e-mail car vous avez demandé un rappel sur le site de Democracy Together.</p>
  </div>`;
}

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
    eventDate: v.number(),
    locale: v.optional(locale),
    captchaToken: v.optional(v.string()),
  },
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'event_reminder');
    const result: { ok: boolean; already: boolean } = await ctx.runMutation(
      internal.eventReminders.storeReminder,
      input,
    );
    return result;
  },
});

export const storeReminder = internalMutation({
  args: {
    eventSlug: v.string(),
    email: v.string(),
    eventDate: v.number(),
    locale: v.optional(locale),
  },
  handler: async (ctx, args) => {
    const eventSlug = args.eventSlug.trim();
    const email = args.email.trim().toLowerCase();
    if (!eventSlug || eventSlug.length > 100) throw new Error('INVALID_EVENT');
    if (!isEmail(email)) throw new Error('INVALID_EMAIL');

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
      eventDate: args.eventDate,
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
export const _dueReminders = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const pending = await ctx.db
      .query('eventReminders')
      .withIndex('by_sent', (q) => q.eq('sent', false))
      .collect();
    const horizon = now + REMINDER_WINDOW_MS;
    return pending.filter((r) => r.eventDate >= now && r.eventDate <= horizon);
  },
});

export const _markSent = internalMutation({
  args: { id: v.id('eventReminders') },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { sent: true });
  },
});

// Action planifiée (cron quotidien). Les appels e-mail externes vivent dans une
// action, jamais dans une mutation. Pour chaque rappel dû : sendEmail (NO-OP
// sans clé), puis marquage sent:true via une mutation interne.
export const sendDueReminders = internalAction({
  args: {},
  // Type de retour annoté explicitement : `handler` référence
  // `internal.eventReminders.*`, dont les types dépendent de l'API générée de
  // ce fichier — sans annotation, TS boucle (inférence circulaire).
  handler: async (ctx): Promise<{ processed: number }> => {
    const due = await ctx.runQuery(internal.eventReminders._dueReminders, {
      now: Date.now(),
    });
    for (const r of due) {
      const loc = r.locale ?? 'fr';
      try {
        await sendEmail({
          to: r.email,
          subject: 'Rappel — un événement Democracy Together approche',
          html: reminderHtml(r.eventSlug, r.eventDate, loc),
        });
      } catch {
        // L'envoi a échoué (fournisseur indisponible) : on NE marque PAS sent,
        // le prochain passage du cron retentera.
        continue;
      }
      await ctx.runMutation(internal.eventReminders._markSent, { id: r._id });
    }
    return { processed: due.length };
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

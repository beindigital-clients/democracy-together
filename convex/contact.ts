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
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { enforceRecaptcha } from './lib/recaptcha';
import { requireNetworkRole } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';

const fields = {
  name: v.string(),
  email: v.string(),
  subject: v.string(),
  body: v.string(),
};

// Formulaire de contact public (F-17) : valide côté serveur (défense en
// profondeur, l'UI valide aussi) puis stocke la soumission. La lecture / le
// traitement se feront depuis le back-office (F-26).
//
// PORTAIL anti-spam : l'action `submit` vérifie d'abord le jeton reCAPTCHA v3
// (seules les actions ont `fetch`) puis délègue à `store`. La logique métier
// reste dans une internalMutation -> non appelable directement, donc la porte
// captcha ne peut pas être contournée en visant la mutation.
export const submit = action({
  args: { ...fields, captchaToken: v.optional(v.string()) },
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'contact');
    // Annotation explicite : casse la circularité de type TS (action -> api
    // générée -> action) quand on appelle une fonction du même module.
    const result: { ok: boolean } = await ctx.runMutation(
      internal.contact.store,
      input,
    );
    return result;
  },
});

export const store = internalMutation({
  args: fields,
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const email = args.email.trim();
    const subject = args.subject.trim();
    const body = args.body.trim();

    if (name.length < 2) throw new Error('INVALID_NAME');
    if (!isEmail(email)) throw new Error('INVALID_EMAIL');
    if (subject.length < 2) throw new Error('INVALID_SUBJECT');
    if (body.length < 10) throw new Error('INVALID_BODY');

    await enforceRateLimit(ctx, {
      key: `contact:${email.toLowerCase()}`,
      ...RATE_LIMITS.contact,
    });

    await ctx.db.insert('contactMessages', {
      name,
      email,
      subject,
      body,
      handled: false,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

// DEV/TEST seulement (garde AUTH_DEV_OTP) : relit le dernier message d'une
// adresse pour que l'E2E vérifie le stockage réel (cf. otp.latestDevCode).
export const latestForEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const all = await ctx.db.query('contactMessages').order('desc').collect();
    const m = all.find((x) => x.email === email);
    return m
      ? { name: m.name, subject: m.subject, body: m.body, handled: m.handled }
      : null;
  },
});

// --- Back-office (F-17 / F-26) ----------------------------------------------
// Les messages partaient dans un trou noir : aucune query ne les relisait et
// `handled` n'était jamais mis à jour (audit § 3.1). Un visiteur écrivait au
// secrétariat, et personne ne pouvait le lire.
//
// Réservé au modérateur et au-dessus : ces messages contiennent des données
// personnelles (nom, adresse e-mail, contenu libre).
export const listMessages = query({
  args: { status: v.optional(v.union(v.literal('pending'), v.literal('all'))) },
  handler: async (ctx, { status }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const msgs =
      status === 'all'
        ? await ctx.db.query('contactMessages').collect()
        : status === 'pending'
          ? await ctx.db
              .query('contactMessages')
              .withIndex('by_handled', (q) => q.eq('handled', false))
              .collect()
          : await ctx.db.query('contactMessages').collect();
    // Ordre TOTAL : `createdAt` est en millisecondes, donc deux messages reçus
    // dans la même milliseconde sont à égalité — et un comparateur qui renvoie
    // 0 laisse `Array.sort` conserver l'ordre d'entrée, c'est-à-dire le plus
    // ANCIEN en tête. `_creationTime` (précision infra-milliseconde) départage,
    // pour que « les plus récents d'abord » soit vrai quelle que soit la
    // vitesse d'arrivée. Garde : convex/contact-admin.test.ts.
    return msgs.sort(
      (a, b) => b.createdAt - a.createdAt || b._creationTime - a._creationTime,
    );
  },
});

// Marquage « traité », réversible : un message rouvert doit pouvoir repasser
// dans la file. Audité, comme toute action de back-office.
export const setHandled = mutation({
  args: { messageId: v.id('contactMessages'), handled: v.boolean() },
  handler: async (ctx, { messageId, handled }) => {
    const actor = await requireNetworkRole(ctx, 'moderateur');
    const msg = await ctx.db.get(messageId);
    if (!msg) throw new Error('NOT_FOUND');
    await ctx.db.patch(messageId, { handled });
    await recordAudit(ctx, {
      actorId: actor._id,
      action: AUDIT.CONTACT_HANDLED,
      targetId: messageId,
      metadata: { handled: String(handled) },
    });
    return { ok: true };
  },
});

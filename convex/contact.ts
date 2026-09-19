import { v } from 'convex/values';
import { action, internalMutation, internalQuery, query } from './_generated/server';
import { internal } from './_generated/api';
import { isEmail } from './lib/validation';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { enforceRecaptcha } from './lib/recaptcha';

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

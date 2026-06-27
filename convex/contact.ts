import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { isEmail } from './lib/validation';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';

// Formulaire de contact public (F-17) : valide côté serveur (défense en
// profondeur, l'UI valide aussi) puis stocke la soumission. La lecture / le
// traitement se feront depuis le back-office (F-26).
export const submit = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    subject: v.string(),
    body: v.string(),
  },
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
export const latestForEmail = query({
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

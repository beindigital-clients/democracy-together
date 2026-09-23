import { v } from 'convex/values';
import {
  action,
  mutation,
  query,
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
import { requireNetworkRole } from './lib/rbac';
import { COUNTER, bumpCounter, readCounter } from './lib/counters';
import { sendEmail } from './email';
import { locale } from './schema';

// Jeton aléatoire (lien de désinscription).
function newToken(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Gabarit HTML d'un envoi : corps (texte composé par l'éditeur) + pied de
// désinscription obligatoire.
function campaignHtml(body: string, token: string, loc: string): string {
  const site = process.env.SITE_URL ?? 'https://democracy-together.vercel.app';
  const unsubUrl = `${site}/${loc}/newsletter/desinscription?token=${token}`;
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;color:#16191f">
    <h2 style="font-family:Georgia,serif;color:#1f3d6e">Democracy Together</h2>
    ${paragraphs}
    <hr style="border:none;border-top:1px solid #d9d6cd;margin:24px 0"/>
    <p style="color:#646771;font-size:12px">Vous recevez cet e-mail car vous êtes inscrit à la lettre de Democracy Together. <a href="${unsubUrl}">Se désinscrire</a>.</p>
  </div>`;
}

// --- Abonnement public (F-18) -----------------------------------------------
// Portail anti-spam : l'action vérifie reCAPTCHA v3 (seules les actions ont
// `fetch`) puis délègue à `recordSubscription` (internalMutation -> non
// appelable directement, donc la porte captcha ne se contourne pas).
export const subscribe = action({
  args: {
    email: v.string(),
    locale: v.optional(locale),
    captchaToken: v.optional(v.string()),
  },
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'newsletter');
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
    await ctx.runMutation(internal.newsletter.recordSubscription, input);
    return { ok: true };
  },
});

export const recordSubscription = internalMutation({
  args: { email: v.string(), locale: v.optional(locale) },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!isEmail(email)) throw new Error('INVALID_EMAIL');

    // Plafonds NON FORGEABLES (audit M2) — par IP et global par formulaire :
    // changer d'adresse ne rend plus un quota neuf. Cf. lib/rateLimit.ts.
    await enforcePublicFormLimit(ctx, 'newsletter');

    await enforceRateLimit(ctx, {
      key: `newsletter:${email}`,
      ...RATE_LIMITS.newsletter,
    });

    const existing = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
    if (existing) return { ok: true, already: true };

    await ctx.db.insert('newsletterSubscriptions', {
      email,
      locale: args.locale,
      unsubToken: newToken(),
      createdAt: Date.now(),
    });
    await bumpCounter(ctx, COUNTER.NEWSLETTER_SUBSCRIBERS, 1);
    return { ok: true, already: false };
  },
});

// Désinscription par jeton (lien dans l'e-mail) — idempotente.
export const unsubscribe = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!token) return { ok: false };
    const sub = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_token', (q) => q.eq('unsubToken', token))
      .unique();
    if (sub) {
      await ctx.db.delete(sub._id);
      await bumpCounter(ctx, COUNTER.NEWSLETTER_SUBSCRIBERS, -1);
    }
    return { ok: true };
  },
});

// DEV/TEST seulement (garde AUTH_DEV_OTP) : rend le jeton de désinscription
// d'une adresse, pour que l'E2E puisse suivre le lien de l'e-mail comme le
// ferait un abonné (audit F-12 — `/newsletter/desinscription` n'était citée
// par aucune spec, faute justement de pouvoir obtenir un jeton).
//
// CE N'EST PAS UNE RÉOUVERTURE DE L'ORACLE REFERMÉ EN F-09. Cet oracle-là
// était PUBLIC et non authentifié : n'importe qui pouvait demander « cette
// adresse est-elle chez vous ? ». Celui-ci est une `internalQuery` — hors API
// publique, donc appelable par aucun client — doublée de la garde
// AUTH_DEV_OTP, exactement comme `isSubscribed`, `latestForEmail` ou
// `otp.latestDevCode` juste à côté. Il s'invoque par la CLI Convex, en
// contexte de confiance.
export const devUnsubToken = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const sub = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
      .unique();
    return sub?.unsubToken ?? null;
  },
});

// DEV/TEST seulement (garde AUTH_DEV_OTP) : vérifie le stockage réel en E2E.
export const isSubscribed = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const sub = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
      .unique();
    return Boolean(sub);
  },
});

// --- Campagnes (F-65) — back-office, éditeur et au-dessus -------------------
// Nombre d'abonnés — affiché avant l'envoi d'une campagne. Il chargeait la
// table entière pour en lire la longueur ; c'est un compteur dénormalisé
// (convex/counters.ts), donc une lecture d'une ligne (issue #8).
export const subscriberCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    return await readCounter(ctx, COUNTER.NEWSLETTER_SUBSCRIBERS);
  },
});

export const listCampaigns = query({
  args: {},
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    const all = await ctx.db.query('newsletterCampaigns').collect();
    return all
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((c) => ({
        _id: c._id,
        subject: c.subject,
        status: c.status,
        createdAt: c.createdAt,
        sentAt: c.sentAt ?? null,
        recipientCount: c.recipientCount ?? null,
        failedCount: c.failedCount ?? null,
      }));
  },
});

export const createCampaign = mutation({
  args: { subject: v.string(), body: v.string() },
  handler: async (ctx, { subject, body }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const s = subject.trim();
    const b = body.trim();
    if (s.length < 3 || b.length < 10) throw new Error('INVALID_CAMPAIGN');
    return await ctx.db.insert('newsletterCampaigns', {
      subject: s,
      body: b,
      status: 'draft',
      createdBy: editor._id,
      createdAt: Date.now(),
    });
  },
});

// Lance l'envoi : passe en 'sending' puis planifie l'action de livraison
// (les appels e-mail externes vivent dans une action, pas une mutation).
export const sendCampaign = mutation({
  args: { campaignId: v.id('newsletterCampaigns') },
  handler: async (ctx, { campaignId }) => {
    await requireNetworkRole(ctx, 'editeur');
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) throw new Error('NOT_FOUND');
    if (campaign.status !== 'draft') throw new Error('ALREADY_SENT');
    await ctx.db.patch(campaignId, { status: 'sending' });
    await ctx.scheduler.runAfter(0, internal.newsletter.deliverCampaign, {
      campaignId,
    });
    return { ok: true };
  },
});

// --- Interne : livraison via l'adaptateur e-mail (Resend -> SES) ------------
export const _campaign = internalQuery({
  args: { campaignId: v.id('newsletterCampaigns') },
  handler: (ctx, { campaignId }) => ctx.db.get(campaignId),
});

export const _subscribers = internalQuery({
  args: {},
  handler: (ctx) => ctx.db.query('newsletterSubscriptions').collect(),
});

export const _markCampaign = internalMutation({
  args: {
    campaignId: v.id('newsletterCampaigns'),
    status: v.union(v.literal('sent'), v.literal('error')),
    recipientCount: v.number(),
    failedCount: v.number(),
  },
  handler: async (ctx, { campaignId, status, recipientCount, failedCount }) => {
    await ctx.db.patch(campaignId, {
      status,
      sentAt: Date.now(),
      recipientCount,
      failedCount,
    });
  },
});

// Envoie la campagne à tous les abonnés, un par un, via l'adaptateur e-mail.
// NB : pour un gros volume, passer à l'API batch de Resend (≤100/appel) et/ou
// découper l'envoi — suffisant pour démarrer.
export const deliverCampaign = internalAction({
  args: { campaignId: v.id('newsletterCampaigns') },
  handler: async (ctx, { campaignId }) => {
    const campaign = await ctx.runQuery(internal.newsletter._campaign, {
      campaignId,
    });
    if (!campaign) return;
    const subs = await ctx.runQuery(internal.newsletter._subscribers, {});

    let sent = 0;
    let failed = 0;
    for (const sub of subs) {
      try {
        await sendEmail({
          to: sub.email,
          subject: campaign.subject,
          html: campaignHtml(
            campaign.body,
            sub.unsubToken ?? '',
            sub.locale ?? 'fr',
          ),
        });
        sent += 1;
      } catch {
        failed += 1;
      }
    }

    await ctx.runMutation(internal.newsletter._markCampaign, {
      campaignId,
      status: failed > 0 && sent === 0 ? 'error' : 'sent',
      recipientCount: sent,
      failedCount: failed,
    });
  },
});

import { Email } from '@convex-dev/auth/providers/Email';
import type { GenericActionCtxWithAuthConfig } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation, internalQuery } from './_generated/server';
import type { DataModel } from './_generated/dataModel';
import { sendOtpEmail, type OtpPurpose } from './email';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { locale, type SiteLocale } from './lib/locales';
import { normalizeEmail } from './lib/onboarding';

// Code numérique à 6 chiffres (Web Crypto, dispo dans le runtime Convex).
function generateCode(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] % 1_000_000).toString().padStart(6, '0');
}

// LA LANGUE DU DESTINATAIRE, et pourquoi elle se lit en base.
//
// Convex Auth ne transmet à `sendVerificationRequest` que
// `{ identifier, url, token, expires, provider }` : les paramètres passés au
// `signIn` du client n'arrivent PAS jusqu'ici (vérifié dans
// `@convex-dev/auth/dist/server/implementation/signIn.js`). La langue ne peut
// donc pas voyager avec la demande — elle est lue sur le compte, où
// `users.preferredLocale` la conserve d'un appareil à l'autre.
//
// UNE LANGUE NE DOIT JAMAIS EMPÊCHER UNE CONNEXION. C'est la règle de ce bloc,
// et elle est absolue : ce code s'exécute sur le chemin du code à usage unique,
// qui est le seul moyen d'entrer pour un membre sans mot de passe. Toute panne
// de la lecture — index manquant, table vide, déploiement en cours de
// migration — retombe sur le français et laisse le courriel partir. Un message
// dans la mauvaise langue est un désagrément ; un message qui ne part pas est
// une porte fermée.
async function recipientLocale(
  ctx: GenericActionCtxWithAuthConfig<DataModel> | undefined,
  email: string,
): Promise<SiteLocale> {
  if (!ctx) return 'fr';
  try {
    const loc = await ctx.runQuery(internal.otp.localeForEmail, { email });
    return loc ?? 'fr';
  } catch {
    return 'fr';
  }
}

// Fabrique un provider OTP par e-mail (vérification, reset, ou connexion).
function otpProvider(id: string, purpose: OtpPurpose) {
  return Email({
    id,
    maxAge: 60 * 15, // 15 min
    async generateVerificationToken() {
      return generateCode();
    },
    async sendVerificationRequest(
      { identifier: email, token: code }: { identifier: string; token: string },
      // ctx optionnel : la signature de base Auth.js n'a qu'un paramètre ;
      // Convex le fournit toujours à l'exécution.
      ctx?: GenericActionCtxWithAuthConfig<DataModel>,
    ) {
      // Anti email-bombing (sécurité) : plafonne les envois de code par adresse
      // AVANT toute génération/envoi. L'adresse est fournie par l'appelant
      // anonyme (inscription, connexion OTP, reset) -> sans plafond, on pourrait
      // inonder la boîte d'un tiers (et la facture e-mail). Lève RATE_LIMITED.
      if (ctx) {
        await ctx.runMutation(internal.otp.enforceSendRate, { email });
      }

      const hasProvider =
        !!process.env.AUTH_RESEND_KEY || !!process.env.AUTH_EMAIL_PROVIDER;
      // Les adresses .test (RFC 6761, utilisées par les E2E) ne reçoivent
      // JAMAIS de vrai e-mail : on évite d'appeler Resend avec des destinataires
      // factices et de casser les tests.
      const isTest = email.endsWith('.test');

      // En dev/test (AUTH_DEV_OTP=true) on capte le code en clair pour les tests.
      // Jamais en prod (AUTH_DEV_OTP non défini) -> aucun code stocké en base.
      if (ctx && process.env.AUTH_DEV_OTP === 'true') {
        await ctx.runMutation(internal.otp.storeDevCode, {
          email,
          code,
          purpose,
        });
      }

      if (hasProvider && !isTest) {
        await sendOtpEmail(
          email,
          code,
          purpose,
          await recipientLocale(ctx, email),
        );
      } else if (!hasProvider) {
        console.log(`[DEV OTP] ${purpose} -> ${email} : ${code}`);
      }
    },
  });
}

export const emailVerification = otpProvider('otp-verify', 'verification');
export const passwordReset = otpProvider('otp-reset', 'reset');
export const emailOtpSignIn = otpProvider('otp-signin', 'signin');

// Plafond d'envoi de codes par e-mail (anti-abus). internalMutation : appelée
// depuis l'action d'auth via ctx.runMutation (le rate-limit a besoin d'un
// MutationCtx pour la table rateLimits).
export const enforceSendRate = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    await enforceRateLimit(ctx, {
      key: `otpSend:${email.trim().toLowerCase()}`,
      ...RATE_LIMITS.otpSend,
    });
  },
});

// Langue préférée d'un compte, pour composer un courriel dans la bonne langue.
//
// `first()` et non `unique()` : deux lignes pour une même adresse ne devraient
// pas exister, mais si cela arrivait, `unique()` LÈVERAIT — et ferait échouer
// l'envoi du code. Voir la règle ci-dessus.
//
// L'adresse est normalisée avant la lecture parce que les comptes sont créés
// avec une adresse déjà normalisée (cf. `lib/signIn.ts`, qui documente cette
// décision), tandis que l'identifiant reçu ici vient de la saisie.
export const localeForEmail = internalQuery({
  args: { email: v.string() },
  returns: v.union(locale, v.null()),
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', normalizeEmail(email)))
      .first();
    return user?.preferredLocale ?? null;
  },
});

export const storeDevCode = internalMutation({
  args: { email: v.string(), code: v.string(), purpose: v.string() },
  handler: async (ctx, { email, code, purpose }) => {
    await ctx.db.insert('devOtpCodes', {
      email,
      code,
      purpose,
      createdAt: Date.now(),
    });
  },
});

// Dernier code en clair pour un e-mail — DEV/TEST UNIQUEMENT.
// Gardé par AUTH_DEV_OTP : en prod (non défini), lève une erreur.
export const latestDevCode = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') {
      throw new Error('Désactivé (AUTH_DEV_OTP).');
    }
    const row = await ctx.db
      .query('devOtpCodes')
      .withIndex('by_email', (q) => q.eq('email', email))
      .order('desc')
      .first();
    return row?.code ?? null;
  },
});

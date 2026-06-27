import { Email } from '@convex-dev/auth/providers/Email';
import type { GenericActionCtxWithAuthConfig } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation, query } from './_generated/server';
import type { DataModel } from './_generated/dataModel';
import { sendOtpEmail, type OtpPurpose } from './email';

// Code numérique à 6 chiffres (Web Crypto, dispo dans le runtime Convex).
function generateCode(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] % 1_000_000).toString().padStart(6, '0');
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
      const hasProvider =
        !!process.env.AUTH_RESEND_KEY || !!process.env.AUTH_EMAIL_PROVIDER;
      // Les adresses .test (RFC 6761, utilisées par les E2E) ne reçoivent
      // JAMAIS de vrai e-mail : on évite d'appeler Resend avec des destinataires
      // factices et de casser les tests.
      const isTest = email.endsWith('.test');

      // En dev/test (AUTH_DEV_OTP=true) on capte le code en clair pour les tests.
      // Jamais en prod (AUTH_DEV_OTP non défini) -> aucun code stocké en base.
      if (ctx && process.env.AUTH_DEV_OTP === 'true') {
        await ctx.runMutation(internal.otp.storeDevCode, { email, code, purpose });
      }

      if (hasProvider && !isTest) {
        await sendOtpEmail(email, code, purpose);
      } else if (!hasProvider) {
        console.log(`[DEV OTP] ${purpose} -> ${email} : ${code}`);
      }
    },
  });
}

export const emailVerification = otpProvider('otp-verify', 'verification');
export const passwordReset = otpProvider('otp-reset', 'reset');
export const emailOtpSignIn = otpProvider('otp-signin', 'signin');

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
export const latestDevCode = query({
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

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

// 6-digit numeric code (Web Crypto, available in the Convex runtime).
function generateCode(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] % 1_000_000).toString().padStart(6, '0');
}

// THE RECIPIENT'S LANGUAGE, and why it is read from the database.
//
// Convex Auth only passes `sendVerificationRequest`
// `{ identifier, url, token, expires, provider }`: the parameters passed to the
// client's `signIn` do NOT reach this point (checked in
// `@convex-dev/auth/dist/server/implementation/signIn.js`). The language therefore
// cannot travel with the request — it is read from the account, where
// `users.preferredLocale` keeps it from one device to another.
//
// A LANGUAGE MUST NEVER PREVENT A SIGN-IN. This is the rule of this block,
// and it is absolute: this code runs on the one-time code path,
// which is the only way in for a member without a password. Any failure
// of the read — missing index, empty table, deployment mid-
// migration — falls back to French and lets the email go out. A message
// in the wrong language is a nuisance; a message that does not go out is
// a closed door.
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

// Builds an email OTP provider (verification, reset, or sign-in).
function otpProvider(id: string, purpose: OtpPurpose) {
  return Email({
    id,
    maxAge: 60 * 15, // 15 min
    async generateVerificationToken() {
      return generateCode();
    },
    async sendVerificationRequest(
      { identifier: email, token: code }: { identifier: string; token: string },
      // optional ctx: the base Auth.js signature has only one parameter;
      // Convex always provides it at runtime.
      ctx?: GenericActionCtxWithAuthConfig<DataModel>,
    ) {
      // Anti email-bombing (security): caps code sends per address
      // BEFORE any generation/sending. The address is supplied by the anonymous
      // caller (signup, OTP sign-in, reset) -> without a cap, one could
      // flood a third party's inbox (and the email bill). Throws RATE_LIMITED.
      if (ctx) {
        await ctx.runMutation(internal.otp.enforceSendRate, { email });
      }

      const hasProvider =
        !!process.env.AUTH_RESEND_KEY || !!process.env.AUTH_EMAIL_PROVIDER;
      // .test addresses (RFC 6761, used by the E2E) NEVER receive
      // a real email: we avoid calling Resend with dummy recipients
      // and breaking the tests.
      const isTest = email.endsWith('.test');

      // In dev/test (AUTH_DEV_OTP=true) we capture the plaintext code for tests.
      // Never in prod (AUTH_DEV_OTP undefined) -> no code stored in the database.
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

// Id of the reset provider, as stored on each code it issues. Exported for
// `passwordReset.checkCode`, which must recognise these codes: `Email()`
// keeps the id in `options`, and the object's own `id` reads "email".
export const RESET_PROVIDER_ID = 'otp-reset';

export const emailVerification = otpProvider('otp-verify', 'verification');
export const passwordReset = otpProvider(RESET_PROVIDER_ID, 'reset');
export const emailOtpSignIn = otpProvider('otp-signin', 'signin');

// Cap on emailed code sends (anti-abuse). internalMutation: called
// from the auth action via ctx.runMutation (the rate limit needs a
// MutationCtx for the rateLimits table).
export const enforceSendRate = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    await enforceRateLimit(ctx, {
      key: `otpSend:${email.trim().toLowerCase()}`,
      ...RATE_LIMITS.otpSend,
    });
  },
});

// Preferred language of an account, to compose an email in the right language.
//
// `first()` and not `unique()`: two rows for the same address should not
// exist, but if it happened, `unique()` would THROW — and make the
// code send fail. See the rule above.
//
// The address is normalized before the read because accounts are created
// with an already normalized address (see `lib/signIn.ts`, which documents this
// decision), whereas the identifier received here comes from user input.
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

// Latest plaintext code for an email — DEV/TEST ONLY.
// Guarded by AUTH_DEV_OTP: in prod (undefined), throws an error.
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

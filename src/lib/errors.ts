import { ConvexError } from 'convex/values';

// Detects the rate-limit overflow returned by the server
// (convex/lib/rateLimit.ts -> ConvexError('RATE_LIMITED')). `data` travels through
// to the client, unlike a bare Error's message (masked in prod).
export function isRateLimited(error: unknown): boolean {
  return error instanceof ConvexError && error.data === 'RATE_LIMITED';
}

// reCAPTCHA v3 verification failure returned by the gateway action
// (convex/lib/recaptcha.ts -> ConvexError('CAPTCHA_FAILED')). Same mechanism as
// RATE_LIMITED: `data` travels through to the client for a dedicated message.
export function isCaptchaFailed(error: unknown): boolean {
  return error instanceof ConvexError && error.data === 'CAPTCHA_FAILED';
}

// Newsletter sign-up refused for lack of an email provider
// (convex/newsletter.ts -> ConvexError('EMAIL_PROVIDER_NOT_CONFIGURED')): the
// double opt-in confirmation link could not be sent.
export function isEmailProviderMissing(error: unknown): boolean {
  return (
    error instanceof ConvexError &&
    error.data === 'EMAIL_PROVIDER_NOT_CONFIGURED'
  );
}

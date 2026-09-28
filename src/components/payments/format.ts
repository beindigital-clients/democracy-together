import { ConvexError } from 'convex/values';
import {
  CURRENCY_EXPONENT,
  fromMinor,
  type Currency,
} from '@convex/lib/payments/amounts';
import { intlLocale } from '@/i18n/locale';

// On-screen amount formatting: ALWAYS in the page's language, from
// the stored minor unit (cents). The ISO code (`EUR`, `USD`)
// rather than the symbol: "$" also denotes the Canadian or
// Australian dollar, the code is never ambiguous.
export function formatMoney(
  minor: number,
  currency: Currency,
  locale: string,
): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  }).format(fromMinor(minor, currency));
}

export function formatMajor(
  major: number,
  currency: Currency,
  locale: string,
): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    maximumFractionDigits: CURRENCY_EXPONENT[currency],
  }).format(major);
}

export function formatDay(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(ts);
}

// Rejection code carried by a `ConvexError` (`data` travels through to the client,
// unlike a bare Error's message, which is masked in production).
export function paymentErrorCode(err: unknown): string | null {
  return err instanceof ConvexError && typeof err.data === 'string'
    ? err.data
    : null;
}

// Codes known to the payment screens: an unlisted code falls back to the
// generic message, never to a raw key.
export const PAYMENT_ERROR_CODES = [
  'CAPTCHA_FAILED',
  'RATE_LIMITED',
  'AMOUNT_OUT_OF_BOUNDS',
  'PAYMENTS_UNAVAILABLE',
  'PROVIDER_ERROR',
  'INVALID_EMAIL',
  'INVALID_NAME',
  'INVALID_MESSAGE',
  'PLAN_UNAVAILABLE',
  'PLAN_WITHOUT_AMOUNT',
  'INVALID_REASON',
  'ALREADY_REFUNDED',
  'REFUND_UNSUPPORTED',
  'FORBIDDEN',
  'FAKE_PROVIDER_DISABLED',
  'NOT_FOUND',
] as const;

export function knownPaymentError(err: unknown): string {
  const code = paymentErrorCode(err);
  return code && (PAYMENT_ERROR_CODES as readonly string[]).includes(code)
    ? code
    : 'GENERIC';
}

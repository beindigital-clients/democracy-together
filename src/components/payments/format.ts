import { ConvexError } from 'convex/values';
import { fromMinor, type Currency } from '@convex/lib/payments/amounts';
import { intlLocale } from '@/i18n/locale';

// Formatage des montants à l'écran : TOUJOURS dans la langue de la page, à
// partir de l'unité mineure stockée (centimes, francs CFA). Le code ISO
// (`EUR`, `XOF`) plutôt que le symbole : « F CFA » s'écrit de trois façons
// selon les pays de l'UEMOA, le code n'est jamais ambigu.
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
    maximumFractionDigits: currency === 'XOF' ? 0 : 2,
  }).format(major);
}

export function formatDay(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(ts);
}

// Code de refus porté par une `ConvexError` (`data` traverse jusqu'au client,
// contrairement au message d'un Error nu, masqué en production).
export function paymentErrorCode(err: unknown): string | null {
  return err instanceof ConvexError && typeof err.data === 'string'
    ? err.data
    : null;
}

// Codes connus des écrans de paiement : un code hors liste retombe sur le
// message générique, jamais sur une clé brute.
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

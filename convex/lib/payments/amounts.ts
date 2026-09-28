// PAYMENT AMOUNTS, CURRENCIES AND BOUNDS (F-27/F-28) — PURE module.
//
// Pure by design: the interface reads it through the `@convex/lib/payments/amounts`
// alias (donation form bounds, suggested amounts, default price list) and the
// server through a relative import. A bound written twice would end up
// diverging: the form would accept an amount the server refuses, and the
// donor would only see a generic error after the redirect.
//
// MINOR UNIT EVERYWHERE IN THE DATABASE. A stored amount is an INTEGER in the minor
// unit of its currency (ISO 4217): the euro cent, the dollar cent.
// That is what Stripe expects (`unit_amount`), and it is what avoids
// floats in accounting totals.
//
// Two currencies, both settled by Stripe: the euro (Europe) and the United
// States dollar. The exponent stays explicit per currency: a currency without
// decimals (CFA franc, exponent 0) can be added without touching the computations.

export const CURRENCIES = ['EUR', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_EXPONENT: Record<Currency, number> = { EUR: 2, USD: 2 };

export function isCurrency(value: unknown): value is Currency {
  return (
    typeof value === 'string' &&
    (CURRENCIES as readonly string[]).includes(value)
  );
}

// Bounds of a DONATION, in MAJOR units. The floor covers the provider's
// fixed fees (a €1 donation would cost almost as much as it brings in); the
// ceiling bounds a typo (one zero too many) and laundering through
// a small organization: beyond it, a large donation goes through the secretariat.
export const DONATION_BOUNDS: Record<Currency, { min: number; max: number }> = {
  EUR: { min: 5, max: 10_000 },
  USD: { min: 5, max: 10_000 },
};

// Amounts offered in one click on /don, in major units.
export const SUGGESTED_DONATIONS: Record<Currency, readonly number[]> = {
  EUR: [20, 50, 100, 250],
  USD: [20, 50, 100, 250],
};

// Bounds of a PRICE LIST amount (edited by the administrator), in major
// units. An organization membership fee can be high; zero is not a
// price (a free plan is disabled, it is not billed at 0).
export const PLAN_BOUNDS: Record<Currency, { min: number; max: number }> = {
  EUR: { min: 1, max: 100_000 },
  USD: { min: 1, max: 100_000 },
};

// A membership fee covers twelve months from its payment (or from the end of
// the current period, if the member renews early).
export const MEMBERSHIP_PERIOD_MONTHS = 12;

/** Converts an entered amount (major units) into minor units, or null
 *  if the amount cannot be represented exactly (too many decimals, NaN). */
export function toMinor(major: number, currency: Currency): number | null {
  if (!Number.isFinite(major)) return null;
  const factor = 10 ** CURRENCY_EXPONENT[currency];
  const minor = Math.round(major * factor);
  // Tolerance of a thousandth of a minor unit: 19.99 * 100 is 1998.9999…
  if (Math.abs(minor - major * factor) > 1e-6 * factor) return null;
  return minor;
}

export function fromMinor(minor: number, currency: Currency): number {
  return minor / 10 ** CURRENCY_EXPONENT[currency];
}

export function isDonationAmountValid(
  minor: number,
  currency: Currency,
): boolean {
  if (!Number.isInteger(minor)) return false;
  const { min, max } = DONATION_BOUNDS[currency];
  const factor = 10 ** CURRENCY_EXPONENT[currency];
  return minor >= min * factor && minor <= max * factor;
}

export function isPlanAmountValid(minor: number, currency: Currency): boolean {
  if (!Number.isInteger(minor)) return false;
  const { min, max } = PLAN_BOUNDS[currency];
  const factor = 10 ** CURRENCY_EXPONENT[currency];
  return minor >= min * factor && minor <= max * factor;
}

// --- Default price list -----------------------------------------------------
//
// Categories and zones reuse EXACTLY the keys of the public estimator
// (src/lib/membership-content.ts): the price list in the database replaces the
// indicative estimate without changing the screen's vocabulary.
export const PLAN_CATEGORIES = ['org', 'ind', 'jeu'] as const;
export type PlanCategory = (typeof PLAN_CATEGORIES)[number];
export const PLAN_ZONES = ['high', 'mid', 'low'] as const;
export type PlanZone = (typeof PLAN_ZONES)[number];

const DEFAULT_BASE_EUR: Record<PlanCategory, number> = {
  org: 1200,
  ind: 120,
  jeu: 25,
};
const DEFAULT_ZONE_FACTOR: Record<PlanZone, number> = {
  high: 1,
  mid: 0.5,
  low: 0.25,
};

/** Price list proposed at initialization, in MINOR units. The administrator
 *  then adjusts it in the "Formules" screen; nothing re-reads it afterwards. */
export function defaultPlanAmounts(
  category: PlanCategory,
  zone: PlanZone,
): { amountEur: number; amountUsd: number } {
  // Same rounding to €5 as the estimator, €5 floor (a €0 price is not
  // a price).
  const eur = Math.max(
    5,
    Math.round((DEFAULT_BASE_EUR[category] * DEFAULT_ZONE_FACTOR[zone]) / 5) *
      5,
  );
  // Same round figure in dollars: the euro and the dollar float against
  // each other, a rate frozen in the code would be wrong in six months. It is a
  // starting point, which the administrator sets in the "Formules" screen.
  return { amountEur: eur * 100, amountUsd: eur * 100 };
}

// --- Dates -------------------------------------------------------------------

/** Adds calendar months in UTC, clamping the day to the last day of the
 *  target month (January 31 + 1 month = February 28/29, not March 3). */
export function addMonthsUtc(ts: number, months: number): number {
  const d = new Date(ts);
  const day = d.getUTCDate();
  const target = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + months,
      1,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.getTime();
}

/** Accounting month "YYYY-MM" (UTC) of a timestamp. */
export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// --- "Document" formatting ---------------------------------------------------
//
// Formatting WITHOUT `Intl`, for the PDF receipt: the standard PDF fonts only
// know the WinAnsi encoding, and French `Intl` separates thousands
// with a narrow no-break space (U+202F) they cannot draw. The
// receipt is a French accounting document: "1 234,56 €", "1 234,56 $ US".
export function formatAmountFr(minor: number, currency: Currency): string {
  const exp = CURRENCY_EXPONENT[currency];
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const intPart = Math.floor(abs / 10 ** exp);
  const frac = abs % 10 ** exp;
  const grouped = String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const number =
    exp > 0 ? `${grouped},${String(frac).padStart(exp, '0')}` : grouped;
  // "$ US" and not "$" alone: the Canadian, Australian… dollars are also
  // written "$".
  const symbol = currency === 'EUR' ? '€' : '$ US';
  return `${negative ? '-' : ''}${number} ${symbol}`;
}

// MONTANTS, DEVISES ET BORNES DES PAIEMENTS (F-27/F-28) — module PUR.
//
// Pur à dessein : l'interface le lit par l'alias `@convex/lib/payments/amounts`
// (bornes du formulaire de don, montants suggérés, barème par défaut) et le
// serveur par import relatif. Une borne écrite deux fois finirait par
// diverger : le formulaire accepterait un montant que le serveur refuse, et le
// donateur ne verrait qu'une erreur générique après la redirection.
//
// UNITÉ MINEURE PARTOUT EN BASE. Un montant stocké est un ENTIER dans l'unité
// mineure de sa devise (ISO 4217) : le centime pour l'euro, le franc lui-même
// pour le franc CFA (exposant 0). C'est ce qu'attendent Stripe (`unit_amount`)
// et PayDunya (`total_amount`), et c'est ce qui évite les flottants dans les
// totaux comptables.

export const CURRENCIES = ['EUR', 'XOF'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_EXPONENT: Record<Currency, number> = { EUR: 2, XOF: 0 };

export function isCurrency(value: unknown): value is Currency {
  return (
    typeof value === 'string' &&
    (CURRENCIES as readonly string[]).includes(value)
  );
}

// Bornes d'un DON, en unités MAJEURES. Le plancher couvre les frais fixes du
// prestataire (un don de 1 € coûterait presque autant qu'il rapporte) ; le
// plafond borne une faute de frappe (un zéro de trop) et le blanchiment par
// petite structure : au-delà, un grand don passe par le secrétariat.
export const DONATION_BOUNDS: Record<Currency, { min: number; max: number }> = {
  EUR: { min: 5, max: 10_000 },
  XOF: { min: 1_000, max: 5_000_000 },
};

// Montants proposés en un clic sur /don, en unités majeures.
export const SUGGESTED_DONATIONS: Record<Currency, readonly number[]> = {
  EUR: [20, 50, 100, 250],
  XOF: [5_000, 10_000, 25_000, 50_000],
};

// Bornes d'un montant du BARÈME (édité par l'administrateur), en unités
// majeures. Une cotisation d'organisation peut être élevée ; zéro n'est pas un
// tarif (une formule gratuite se désactive, elle ne se facture pas à 0).
export const PLAN_BOUNDS: Record<Currency, { min: number; max: number }> = {
  EUR: { min: 1, max: 100_000 },
  XOF: { min: 100, max: 60_000_000 },
};

// Une cotisation couvre douze mois à compter de son règlement (ou de la fin de
// la période en cours, si le membre renouvelle en avance).
export const MEMBERSHIP_PERIOD_MONTHS = 12;

/** Convertit un montant saisi (unités majeures) en unités mineures, ou null
 *  si le montant n'est pas représentable exactement (trop de décimales, NaN). */
export function toMinor(major: number, currency: Currency): number | null {
  if (!Number.isFinite(major)) return null;
  const factor = 10 ** CURRENCY_EXPONENT[currency];
  const minor = Math.round(major * factor);
  // Tolérance d'un millième d'unité mineure : 19.99 * 100 vaut 1998.9999…
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

// --- Barème par défaut ------------------------------------------------------
//
// Catégories et zones reprennent EXACTEMENT les clés de l'estimateur public
// (src/lib/membership-content.ts) : le barème en base remplace l'estimation
// indicative sans changer le vocabulaire de l'écran.
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

// Parité fixe EUR/XOF (franc CFA arrimé à l'euro depuis 1999) : c'est un
// taux légal, pas un cours de marché — il ne dérive pas.
export const EUR_TO_XOF = 655.957;

/** Barème proposé à l'initialisation, en unités MINEURES. L'administrateur
 *  l'ajuste ensuite dans l'écran « Formules » ; rien ne le relit après. */
export function defaultPlanAmounts(
  category: PlanCategory,
  zone: PlanZone,
): { amountEur: number; amountXof: number } {
  // Même arrondi aux 5 € que l'estimateur, plancher 5 € (un tarif à 0 € n'en
  // est pas un).
  const eur = Math.max(
    5,
    Math.round((DEFAULT_BASE_EUR[category] * DEFAULT_ZONE_FACTOR[zone]) / 5) *
      5,
  );
  // Arrondi au millier de francs : un tarif en XOF se lit en milliers.
  const xof = Math.max(1000, Math.round((eur * EUR_TO_XOF) / 1000) * 1000);
  return { amountEur: eur * 100, amountXof: xof };
}

// --- Dates -------------------------------------------------------------------

/** Ajoute des mois calendaires en UTC, en ramenant le jour au dernier jour du
 *  mois cible (31 janvier + 1 mois = 28/29 février, pas 3 mars). */
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

/** Mois comptable « AAAA-MM » (UTC) d'un horodatage. */
export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// --- Formatage « document » --------------------------------------------------
//
// Formatage SANS `Intl`, pour le reçu PDF : les polices standard du PDF ne
// connaissent que l'encodage WinAnsi, et `Intl` en français sépare les milliers
// par une espace fine insécable (U+202F) qu'elles ne savent pas dessiner. Le
// reçu est un document comptable français : « 1 234,56 € », « 25 000 FCFA ».
export function formatAmountFr(minor: number, currency: Currency): string {
  const exp = CURRENCY_EXPONENT[currency];
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const intPart = Math.floor(abs / 10 ** exp);
  const frac = abs % 10 ** exp;
  const grouped = String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const number =
    exp > 0 ? `${grouped},${String(frac).padStart(exp, '0')}` : grouped;
  const symbol = currency === 'EUR' ? '€' : 'FCFA';
  return `${negative ? '-' : ''}${number} ${symbol}`;
}

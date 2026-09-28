import { CURRENCIES, type Currency } from './amounts';
import type { ProviderId } from './validators';
import type { SiteLocale } from '../locales';

// PAYMENT CONFIGURATION — everything comes from the Convex deployment's
// environment variables, never from code. Without a key, no provider is
// offered: the interface SAYS so (no dead button) and offers bank transfer or
// the contact form. Same principle as e-mail (convex/email.ts) and reCAPTCHA
// (convex/lib/recaptcha.ts): a missing configuration is a clean refusal.

// --- Fake provider ------------------------------------------------------------
//
// The fake provider simulates the payment AND the webhook end to end: it
// serves E2E tests and development, with no account anywhere. It creates
// REAL transactions and REAL numbered receipts: on a production deployment,
// it would make it possible to issue receipts for money never received.
// Hence a three-condition guard, modelled on `AUTH_DEV_OTP`
// (convex/otp.ts, convex/devAdmin.ts):
//
//  1. `PAYMENTS_FAKE_PROVIDER` is EXACTLY `1` — a sloppily set value
//     (`true`, `yes`) activates nothing;
//  2. `AUTH_DEV_OTP` is `true` — the repo's dev/preview marker, which the
//     deployment docs forbid in production;
//  3. no PRODUCTION INDICATOR is present: a live Stripe key
//     (`sk_live_…`/`rk_live_…`). A deployment that
//     collects real money does not simulate payments, even if the first two
//     flags leaked into it.
//
// Flag set but guard refused: `refused` state, loud in the logs, and the
// provider stays off.
export type FakeProviderState = 'off' | 'active' | 'refused';

export function productionIndicators(): string[] {
  const found: string[] = [];
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? '';
  if (stripeKey.startsWith('sk_live_') || stripeKey.startsWith('rk_live_')) {
    found.push('STRIPE_SECRET_KEY (live)');
  }
  return found;
}

export function fakeProviderState(): FakeProviderState {
  if (process.env.PAYMENTS_FAKE_PROVIDER !== '1') return 'off';
  if (process.env.AUTH_DEV_OTP !== 'true') {
    console.error(
      '[payments] PAYMENTS_FAKE_PROVIDER=1 REFUSÉ : AUTH_DEV_OTP n’est pas posé, ce déploiement n’est ni un dev ni une préversion. Retirez la variable : npx convex env remove PAYMENTS_FAKE_PROVIDER',
    );
    return 'refused';
  }
  const prod = productionIndicators();
  if (prod.length > 0) {
    console.error(
      `[payments] PAYMENTS_FAKE_PROVIDER=1 REFUSÉ : indicateurs de production présents (${prod.join(', ')}).`,
    );
    return 'refused';
  }
  return 'active';
}

// HMAC secret for fake webhooks. A default value is acceptable HERE and only
// here: the fake provider only exists behind the guard above, and the secret
// protects no real money.
export function fakeWebhookSecret(): string {
  return (
    process.env.PAYMENTS_FAKE_WEBHOOK_SECRET || 'dt-fake-provider-dev-secret'
  );
}

// --- Real providers -----------------------------------------------------------

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;
}

export function isProviderEnabled(provider: ProviderId): boolean {
  switch (provider) {
    case 'stripe':
      return stripeConfigured();
    case 'fake':
      return fakeProviderState() === 'active';
  }
}

// Provider chosen for a currency. Stripe settles ALL the site's currencies
// (euro and dollar) with the same account. A configured real provider takes
// precedence over the fake one, so that a developer testing their Stripe test
// keys does not go through the simulation. A currency Stripe would not cover
// (CFA franc settled by an African provider, later) would plug in here, with
// its adapter (convex/lib/payments/registry.ts).
export function providerForCurrency(currency: Currency): ProviderId | null {
  if (CURRENCIES.includes(currency) && stripeConfigured()) return 'stripe';
  if (fakeProviderState() === 'active') return 'fake';
  return null;
}

// --- Addresses ----------------------------------------------------------------

export function siteUrl(): string {
  return (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

// Public address of the Convex HTTP actions (webhook routes): provided by the
// platform on every deployment.
export function convexSiteUrl(): string {
  return (process.env.CONVEX_SITE_URL ?? '').replace(/\/+$/, '');
}

export type ReturnOutcome = 'succes' | 'annule';

/** Path (without host) of the payment return page. */
export function returnPath(
  locale: SiteLocale,
  ref: string,
  outcome: ReturnOutcome,
): string {
  return `/${locale}/paiement/retour?ref=${encodeURIComponent(ref)}&statut=${outcome}`;
}

export function returnUrl(
  locale: SiteLocale,
  ref: string,
  outcome: ReturnOutcome,
): string {
  return `${siteUrl()}${returnPath(locale, ref, outcome)}`;
}

export function receiptLinkUrl(locale: SiteLocale, token: string): string {
  return `${siteUrl()}/${locale}/paiement/recu/${token}`;
}

// --- Association details (receipts) -------------------------------------------
//
// The legal information has not yet been provided by the association
// (docs/infos-legales-client.md: head office, legal representative, RNA/SIRET).
// It is NEVER invented: without a variable, the receipt carries the same
// marker as the site's legal notice (src/lib/legal-content.ts).
export const LEGAL_TODO = '[à compléter avant mise en ligne]';

export type AssociationInfo = {
  name: string;
  legalForm: string;
  address: string;
  rna: string;
  siret: string | null;
  representative: string;
  // The patronage scheme (tax receipt, art. 200 and 238 bis of the CGI) requires
  // a tax ruling the association does not have (RMDL-cadrage-technique.md, legal
  // risks). Until it is confirmed, the receipt says so.
  taxReceiptEligible: boolean;
};

export function associationInfo(): AssociationInfo {
  return {
    name: process.env.ASSOCIATION_NAME || 'Democracy Together',
    legalForm:
      process.env.ASSOCIATION_LEGAL_FORM ||
      'Association régie par la loi du 1er juillet 1901',
    address: process.env.ASSOCIATION_ADDRESS || LEGAL_TODO,
    rna: process.env.ASSOCIATION_RNA || LEGAL_TODO,
    siret: process.env.ASSOCIATION_SIRET || null,
    representative: process.env.ASSOCIATION_REPRESENTATIVE || LEGAL_TODO,
    taxReceiptEligible: process.env.ASSOCIATION_TAX_RECEIPT_ELIGIBLE === 'true',
  };
}

// Bank transfer details, offered when no provider is available. Missing from
// the legal information provided so far: without a configured IBAN, the
// interface points to the contact form.
export type BankTransferInfo = {
  holder: string;
  iban: string;
  bic: string | null;
  bank: string | null;
};

export function bankTransferInfo(): BankTransferInfo | null {
  const iban = process.env.PAYMENTS_BANK_IBAN;
  if (!iban) return null;
  return {
    holder: process.env.PAYMENTS_BANK_HOLDER || associationInfo().name,
    iban,
    bic: process.env.PAYMENTS_BANK_BIC || null,
    bank: process.env.PAYMENTS_BANK_NAME || null,
  };
}

import type { Currency } from './amounts';
import type { ProviderId } from './validators';
import type { SiteLocale } from '../locales';

// CONFIGURATION DES PAIEMENTS — tout vient des variables d'environnement du
// déploiement Convex, jamais du code. Sans clé, aucun prestataire n'est
// proposé : l'interface le DIT (pas de bouton mort) et propose le virement ou
// le contact. Même principe que l'e-mail (convex/email.ts) et reCAPTCHA
// (convex/lib/recaptcha.ts) : une configuration absente est un refus propre.

// --- Prestataire factice ------------------------------------------------------
//
// Le prestataire factice simule le paiement ET le webhook de bout en bout : il
// sert aux E2E et au développement, sans compte chez personne. Il crée de
// VRAIES transactions et de VRAIS reçus numérotés : sur un déploiement de
// production, il permettrait de fabriquer des reçus pour de l'argent jamais
// reçu. D'où une garde à trois conditions, sur le modèle d'`AUTH_DEV_OTP`
// (convex/otp.ts, convex/devAdmin.ts) :
//
//  1. `PAYMENTS_FAKE_PROVIDER` vaut EXACTEMENT `1` — une valeur posée de
//     travers (`true`, `yes`) n'active rien ;
//  2. `AUTH_DEV_OTP` vaut `true` — le marqueur de dev/préversion du dépôt, que
//     la doc de déploiement interdit en production ;
//  3. aucun INDICATEUR DE PRODUCTION n'est présent : une clé Stripe live
//     (`sk_live_…`/`rk_live_…`) ou PayDunya en mode `live`. Un déploiement qui
//     encaisse de l'argent réel ne simule pas de paiement, même si les deux
//     premiers drapeaux y ont fui.
//
// Drapeau posé mais garde refusée : état `refused`, bruyant dans les journaux,
// et le prestataire reste coupé.
export type FakeProviderState = 'off' | 'active' | 'refused';

export function productionIndicators(): string[] {
  const found: string[] = [];
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? '';
  if (stripeKey.startsWith('sk_live_') || stripeKey.startsWith('rk_live_')) {
    found.push('STRIPE_SECRET_KEY (live)');
  }
  if ((process.env.PAYDUNYA_MODE ?? '').toLowerCase() === 'live') {
    found.push('PAYDUNYA_MODE=live');
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

// Secret HMAC des webhooks factices. Une valeur par défaut est acceptable ICI
// et seulement ici : le prestataire factice n'existe que derrière la garde
// ci-dessus, et le secret ne protège aucun argent réel.
export function fakeWebhookSecret(): string {
  return (
    process.env.PAYMENTS_FAKE_WEBHOOK_SECRET || 'dt-fake-provider-dev-secret'
  );
}

// --- Prestataires réels -------------------------------------------------------

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;
}

export function paydunyaConfigured(): boolean {
  return (
    !!process.env.PAYDUNYA_MASTER_KEY &&
    !!process.env.PAYDUNYA_PRIVATE_KEY &&
    !!process.env.PAYDUNYA_TOKEN
  );
}

export function isProviderEnabled(provider: ProviderId): boolean {
  switch (provider) {
    case 'stripe':
      return stripeConfigured();
    case 'paydunya':
      return paydunyaConfigured();
    case 'fake':
      return fakeProviderState() === 'active';
  }
}

// Prestataire retenu pour une devise. Stripe ne couvre pas le franc CFA :
// l'euro va à Stripe, le XOF à PayDunya (Sénégal, mobile money et cartes
// UEMOA). Un prestataire réel configuré l'emporte sur le factice, pour qu'un
// développeur qui teste ses clés sandbox ne passe pas par la simulation.
export function providerForCurrency(currency: Currency): ProviderId | null {
  if (currency === 'EUR' && stripeConfigured()) return 'stripe';
  if (currency === 'XOF' && paydunyaConfigured()) return 'paydunya';
  if (fakeProviderState() === 'active') return 'fake';
  return null;
}

// --- Adresses -----------------------------------------------------------------

export function siteUrl(): string {
  return (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

// Adresse publique des actions HTTP Convex (routes de webhook) : fournie par
// la plateforme sur chaque déploiement.
export function convexSiteUrl(): string {
  return (process.env.CONVEX_SITE_URL ?? '').replace(/\/+$/, '');
}

export type ReturnOutcome = 'succes' | 'annule';

/** Chemin (sans hôte) de la page de retour de paiement. */
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

// --- Mentions de l'association (reçus) ----------------------------------------
//
// Les informations légales ne sont pas encore fournies par l'association
// (docs/infos-legales-client.md : siège, représentant légal, RNA/SIRET). Elles
// ne sont JAMAIS inventées : sans variable, le reçu porte le même marqueur que
// les mentions légales du site (src/lib/legal-content.ts).
export const LEGAL_TODO = '[à compléter avant mise en ligne]';

export type AssociationInfo = {
  name: string;
  legalForm: string;
  address: string;
  rna: string;
  siret: string | null;
  representative: string;
  // Le régime du mécénat (reçu fiscal, art. 200 et 238 bis du CGI) suppose un
  // rescrit que l'association n'a pas (RMDL-cadrage-technique.md, risques
  // juridiques). Tant qu'il n'est pas confirmé, le reçu le dit.
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

// Coordonnées de virement, proposées quand aucun prestataire n'est disponible.
// Absentes des informations légales fournies à ce jour : sans IBAN configuré,
// l'interface renvoie vers le formulaire de contact.
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

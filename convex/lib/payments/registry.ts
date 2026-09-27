import type { ProviderId } from './validators';
import type { PaymentAdapter } from './types';
import { stripeAdapter } from './stripe';
import { paydunyaAdapter } from './paydunya';
import { fakeAdapter } from './fake';

// Registre des adaptateurs. Ajouter un prestataire (CinetPay, Wave direct,
// Mollie…) = écrire un adaptateur conforme à `PaymentAdapter`, l'inscrire ici
// et dans `providerIdValidator`, puis lui ouvrir une route de webhook.
const ADAPTERS: Record<ProviderId, PaymentAdapter> = {
  stripe: stripeAdapter,
  paydunya: paydunyaAdapter,
  fake: fakeAdapter,
};

export function getAdapter(provider: ProviderId): PaymentAdapter {
  return ADAPTERS[provider];
}

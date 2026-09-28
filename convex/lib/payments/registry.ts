import type { ProviderId } from './validators';
import type { PaymentAdapter } from './types';
import { stripeAdapter } from './stripe';
import { fakeAdapter } from './fake';

// Registre des adaptateurs. Ajouter un prestataire (un PSP africain pour le
// franc CFA, Mollie…) = écrire un adaptateur conforme à `PaymentAdapter`, l'inscrire ici
// et dans `providerIdValidator`, puis lui ouvrir une route de webhook.
const ADAPTERS: Record<ProviderId, PaymentAdapter> = {
  stripe: stripeAdapter,
  fake: fakeAdapter,
};

export function getAdapter(provider: ProviderId): PaymentAdapter {
  return ADAPTERS[provider];
}

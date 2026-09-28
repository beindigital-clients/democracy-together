import type { ProviderId } from './validators';
import type { PaymentAdapter } from './types';
import { stripeAdapter } from './stripe';
import { fakeAdapter } from './fake';

// Adapter registry. Adding a provider (an African PSP for the CFA franc,
// Mollie…) = write an adapter conforming to `PaymentAdapter`, register it here
// and in `providerIdValidator`, then open a webhook route for it.
const ADAPTERS: Record<ProviderId, PaymentAdapter> = {
  stripe: stripeAdapter,
  fake: fakeAdapter,
};

export function getAdapter(provider: ProviderId): PaymentAdapter {
  return ADAPTERS[provider];
}

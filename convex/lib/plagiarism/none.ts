import type { ExternalProvider } from './types';

/** "External check not configured": the review chief must acknowledge it (audited). */
export const noneProvider: ExternalProvider = {
  name: 'none',
  async check() {
    return { status: 'unavailable', provider: 'none', error: 'NO_PROVIDER' };
  },
};

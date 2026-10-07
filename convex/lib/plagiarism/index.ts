import { fakeProvider } from './fake';
import { noneProvider } from './none';
import { webProvider } from './web';
import type {
  ExternalOptions,
  ExternalProvider,
  ExternalResult,
} from './types';

export type { ExternalMatch, ExternalOptions, ExternalResult } from './types';
export { FAKE_PLAGIARISM_MARKER, FAKE_TRANSLATED_MARKER } from './fake';

// KOHOP — originality, EXTERNAL side: the ONLY entry point to an
// anti-plagiarism service (D-17, still open: the vendor is the client's
// choice). Like `aiGateway.ts` and `email.ts`, the provider is an isolated
// adapter selected by `PLAGIARISM_PROVIDER` on the Convex deployment, and it
// FAILS CLOSED: without a provider the status is `unavailable`, which the review
// chief must acknowledge explicitly (audited) before accepting — a forgotten
// configuration is a visible gap, never a silent pass.
//
//   PLAGIARISM_PROVIDER = none (default) | web (internal: open web and open
//                         scholarly archives, no vendor) | fake (tests and
//                         demos) | <vendor>
//   PLAGIARISM_API_KEY  = the vendor's key (never reaches the browser)
//
// `web` needs no vendor, only search keys: BRAVE_SEARCH_API_KEY (open web) and
// CORE_API_KEY (open scholarly archives). See `web.ts` for what it does and,
// above all, what it does not do.
//
// Every provider is called with the same options (`ExternalOptions`): the text
// is NOT retained by the service, and detection across languages is requested
// when the service proposes it. The adapter normalises what comes back to
// `ExternalResult`, whatever the vendor's own report looks like.

export const KOHOP_DEFAULT_PLAGIARISM_PROVIDER = 'none';

const PROVIDERS: Record<string, ExternalProvider> = {
  none: noneProvider,
  fake: fakeProvider,
  web: webProvider,
};

export function configuredProvider(): string {
  return (
    process.env.PLAGIARISM_PROVIDER?.trim().toLowerCase() ||
    KOHOP_DEFAULT_PLAGIARISM_PROVIDER
  );
}

export async function runExternalCheck(
  plainText: string,
  lang = 'fr',
): Promise<ExternalResult> {
  const name = configuredProvider();
  const options: ExternalOptions = {
    storeText: false,
    crossLanguage: true,
    lang,
  };
  const provider = PROVIDERS[name];
  if (provider) return await provider.check(plainText, options);
  // A vendor named in the configuration but not built yet: the key is
  // required, and the call would be made HERE, behind this adapter.
  if (!process.env.PLAGIARISM_API_KEY) {
    return { status: 'unavailable', provider: name, error: 'NO_API_KEY' };
  }
  return {
    status: 'unavailable',
    provider: name,
    error: 'PROVIDER_NOT_IMPLEMENTED',
  };
}

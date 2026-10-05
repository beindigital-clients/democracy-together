import type { KohopMatchClass } from './kohop';

// KOHOP — originality, EXTERNAL side: the ONLY file that would talk to an
// anti-plagiarism service (D-17, still open: the vendor is the client's
// choice). Like `aiGateway.ts` and `email.ts`, the provider is an isolated
// adapter selected by `PLAGIARISM_PROVIDER` on the Convex deployment, and it
// FAILS CLOSED: without a provider the status is `unavailable`, which the review
// chief must acknowledge explicitly (audited) before accepting — a forgotten
// configuration is a visible gap, never a silent pass.
//
//   PLAGIARISM_PROVIDER = none (default) | fake (tests and demos) | <vendor>
//   PLAGIARISM_API_KEY  = the vendor's key (never reaches the browser)
//
// Adding a vendor means adding one branch here; nothing else changes.

export const KOHOP_DEFAULT_PLAGIARISM_PROVIDER = 'none';

export type ExternalMatch = {
  sourceType: string;
  sourceTitle: string;
  sourceUrl?: string;
  passage: string;
  sourcePassage?: string;
  similarity?: number;
  classification?: KohopMatchClass;
};

export type ExternalResult =
  | {
      status: 'done';
      provider: string;
      matches: ExternalMatch[];
      summary: string;
    }
  | { status: 'unavailable'; provider: string; error: string }
  | { status: 'failed'; provider: string; error: string };

export function configuredProvider(): string {
  return (
    process.env.PLAGIARISM_PROVIDER?.trim().toLowerCase() ||
    KOHOP_DEFAULT_PLAGIARISM_PROVIDER
  );
}

/** Marker the `fake` provider reports as a borrowing (tests and demos only). */
export const FAKE_PLAGIARISM_MARKER = 'FAKE_PLAGIARISM_SOURCE';

export async function runExternalCheck(
  plainText: string,
): Promise<ExternalResult> {
  const provider = configuredProvider();
  if (provider === 'none') {
    return { status: 'unavailable', provider, error: 'NO_PROVIDER' };
  }
  if (provider === 'fake') {
    const hit = plainText.includes(FAKE_PLAGIARISM_MARKER);
    return {
      status: 'done',
      provider,
      matches: hit
        ? [
            {
              sourceType: 'web',
              sourceTitle: 'Fake source',
              sourceUrl: 'https://example.org/fake-source',
              passage: FAKE_PLAGIARISM_MARKER,
              similarity: 0.9,
              classification: 'borrowing',
            },
          ]
        : [],
      summary: hit ? '1 match' : '0 match',
    };
  }
  // A real vendor: the key is required, and the call is made HERE.
  if (!process.env.PLAGIARISM_API_KEY) {
    return { status: 'unavailable', provider, error: 'NO_API_KEY' };
  }
  return { status: 'unavailable', provider, error: 'PROVIDER_NOT_IMPLEMENTED' };
}

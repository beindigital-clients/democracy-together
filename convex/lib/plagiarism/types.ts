import type { KohopMatchClass } from '../kohop';

// KOHOP — the contract every anti-plagiarism provider honours. The adapter in
// `index.ts` is the only code that talks to one; adding a vendor means adding a
// file next to this one and a branch there. Nothing else changes.

export type ExternalMatch = {
  sourceType: string;
  sourceTitle: string;
  sourceUrl?: string;
  passage: string;
  sourcePassage?: string;
  similarity?: number;
  classification?: KohopMatchClass;
  /** The service found it by comparing across languages. */
  crossLanguage?: boolean;
};

export type ExternalResult =
  | {
      status: 'done';
      provider: string;
      matches: ExternalMatch[];
      summary: string;
      /**
       * What was NOT fully checked (a source not configured, or that failed).
       * Named codes, shown to the review chief: a gap is never silent.
       */
      warnings?: string[];
    }
  | { status: 'unavailable'; provider: string; error: string }
  | { status: 'failed'; provider: string; error: string };

/**
 * What the platform asks of EVERY provider. These are requirements, not
 * preferences: a provider that cannot honour one must refuse (`unavailable`)
 * rather than run without it.
 */
export type ExternalOptions = {
  /** The service must NOT keep the submitted text (always false: never stored). */
  storeText: false;
  /** Detection from one language to another is requested when the service offers it. */
  crossLanguage: true;
  /** The language the text is written in. */
  lang: string;
};

export type ExternalProvider = {
  name: string;
  check(plainText: string, options: ExternalOptions): Promise<ExternalResult>;
};

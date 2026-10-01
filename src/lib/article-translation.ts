import { isSupportedLocale } from '@/i18n/locale';
import type { Locale } from '@/i18n/routing';

// WHAT DO WE SHOW THE READER? — a pure decision, testable on its own.
//
// Content submitted by a member exists in ONE language, and since
// 2026-10-01 it is translated into every other site language when it goes
// live (convex/translationJobs.ts). The reader picks the language they read
// in; in between, that language's translation may be ready, still being
// prepared, or have failed. The page must display just one text — with, in
// each case, what's needed to understand what is in front of them.
//
// The rule that governs everything else: THE ORIGINAL NEVER DISAPPEARS. A
// machine translation is not an edition; it is displayed under an
// explicit notice, and the original stays one click away. It is the same honesty as
// the "French prevails" clause of the legal pages.
//
// WHY A PURE MODULE, and not an `if` in the page: these states are
// decided twice (Tribune post, publication) and checked once —
// in `tests/unit/article-translation.test.ts`. The page merely
// renders the verdict.

export type TranslationFields = {
  title: string;
  abstract?: string;
  keypoints?: string[];
  body: string[];
};

export type ReadingVersionStatus =
  'original' | 'ready' | 'pending' | 'failed' | 'missing';

/** What the Convex query `translation.getReading` returns. */
export type Reading = {
  sourceLocale: Locale;
  versions: { locale: Locale; status: ReadingVersionStatus }[];
  translation: { fields: TranslationFields } | null;
} | null;

export type ArticleDisplay =
  /** The original, read in its own language's pages: nothing to report. */
  | { kind: 'native' }
  /** A translation, original one click away. */
  | {
      kind: 'translated';
      sourceLocale: Locale;
      locale: Locale;
      fields: TranslationFields;
    }
  /** The original, and why it is the original that is shown. */
  | {
      kind: 'original';
      sourceLocale: Locale;
      /** The language the reader asked for. */
      requested: Locale;
      /**
       * - `chosen`: the reader asked for the original;
       * - `pending`: the translation is being prepared;
       * - `failed`: it could not be produced;
       * - `missing`: there is none (content published before translations
       *   existed, or edited since).
       */
      reason: 'chosen' | 'pending' | 'failed' | 'missing';
    };

/**
 * The language the reader asked to read in.
 *
 * `?lang=xx` names it; `?original=1` (the links of the previous
 * version of this page) asks for the original. Otherwise, the language of
 * the page.
 */
export function requestedLanguage(
  params: Record<string, string | string[] | undefined>,
  pageLocale: Locale,
  sourceLocale: Locale,
): Locale {
  const raw = Array.isArray(params.lang) ? params.lang[0] : params.lang;
  if (raw && isSupportedLocale(raw)) return raw;
  if (params.original === '1') return sourceLocale;
  return pageLocale;
}

/**
 * Decides what to display.
 *
 * @param sourceLocale writing language of the content
 * @param pageLocale   language of the page
 * @param requested    language the reader asked for (`requestedLanguage`)
 * @param reading      `translation.getReading` for `requested`, or null
 */
export function resolveArticleDisplay(
  sourceLocale: Locale,
  pageLocale: Locale,
  requested: Locale,
  reading: Reading,
): ArticleDisplay {
  // 1. The original. On its own language's pages it needs no notice — the
  //    most frequent case, and the one where any notice would be noise.
  if (requested === sourceLocale) {
    return pageLocale === sourceLocale
      ? { kind: 'native' }
      : { kind: 'original', sourceLocale, requested, reason: 'chosen' };
  }

  // 2. An up-to-date translation: serve it, with a notice.
  if (reading?.translation) {
    return {
      kind: 'translated',
      sourceLocale,
      locale: requested,
      fields: reading.translation.fields,
    };
  }

  // 3. No usable translation. Serve the original, saying why.
  const status = reading?.versions.find((v) => v.locale === requested)?.status;
  return {
    kind: 'original',
    sourceLocale,
    requested,
    reason:
      status === 'pending'
        ? 'pending'
        : status === 'failed'
          ? 'failed'
          : 'missing',
  };
}

/**
 * Message key suffix for a translation failure code.
 *
 * The labels live in the catalogue under `translation.err*` and are
 * requested via `vocabulary(t, 'err', suffix)` — the mechanism provided by the
 * repository for a key built at runtime (src/i18n/vocabulary.ts).
 * The alternative, `t(computedKey)`, is explicitly forbidden by
 * `tests/unit/i18n-keys.test.ts`, and for good reason: it would pass off
 * an unexpected code coming from the gateway as a missing interface key,
 * i.e. a bug, whereas it is a normal fallback case.
 *
 * Anything not in this table falls back to `errGeneric`: the
 * gateway may return a new code tomorrow, the page must not be
 * bothered by it.
 */
const ERROR_SUFFIXES: Record<string, string> = {
  AI_GATEWAY_NOT_CONFIGURED: 'NotConfigured',
  RATE_LIMITED: 'RateLimited',
  TOO_LONG: 'TooLong',
  FORBIDDEN: 'Forbidden',
};

export function translationErrorSuffix(code: string | undefined): string {
  return (code && ERROR_SUFFIXES[code]) || 'Generic';
}

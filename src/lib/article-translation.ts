import type { Locale } from '@/i18n/routing';

// WHAT DO WE SHOW THE READER? — a pure decision, testable on its own.
//
// Content submitted by a member exists in ONE language. The reader asks for
// another. In between, there may be a cached translation, perhaps
// stale, perhaps failed. Five states, and the page must display just one
// — with, in each case, what's needed to understand what is in front of them.
//
// The rule that governs everything else: THE ORIGINAL NEVER DISAPPEARS. A
// machine translation is not an edition; it is displayed under an
// explicit notice, and the original stays one click away. It is the same honesty as
// the "French prevails" clause of the legal pages.
//
// WHY A PURE MODULE, and not an `if` in the page: these five states are
// decided twice (Tribune post, publication) and checked once —
// in `tests/unit/article-translation.test.ts`. The page merely
// renders the verdict.

export type TranslationFields = {
  title: string;
  abstract?: string;
  keypoints?: string[];
  body: string[];
};

/** What the Convex query `translation.getTranslation` returns. */
export type CachedTranslation = {
  status: 'pending' | 'ready' | 'failed';
  sourceLocale: Locale;
  targetLocale: Locale;
  fields?: TranslationFields;
  error?: string;
  fresh: boolean;
} | null;

export type ArticleDisplay =
  /** The content's language is the reader's: nothing to report. */
  | { kind: 'native' }
  /** The reader asked for the original, or no translation exists yet. */
  | {
      kind: 'original';
      sourceLocale: Locale;
      /** An up-to-date translation exists: we can point to it. */
      translationAvailable: boolean;
      /** A translation exists but describes a stale version of the text. */
      stale: boolean;
      /** The last attempt failed; `errorCode` says why. */
      errorCode?: string;
    }
  /** Translation displayed, original one click away. */
  | {
      kind: 'translated';
      sourceLocale: Locale;
      fields: TranslationFields;
    };

/**
 * Decides what to display.
 *
 * @param sourceLocale writing language of the content
 * @param readerLocale language of the page
 * @param cached       cached translation for `readerLocale`, or null
 * @param wantsOriginal the reader asked for the original (`?original=1`)
 */
export function resolveArticleDisplay(
  sourceLocale: Locale,
  readerLocale: Locale,
  cached: CachedTranslation,
  wantsOriginal: boolean,
): ArticleDisplay {
  // 1. Same language: no banner, no offer. The most frequent case, and
  //    the one where any notice would be noise.
  if (sourceLocale === readerLocale) return { kind: 'native' };

  const usable =
    cached?.status === 'ready' && cached.fresh && cached.fields !== undefined;

  // 2. The reader explicitly asked for the original. Their choice takes precedence over the
  //    availability of a translation — that is the whole point of the link.
  if (wantsOriginal) {
    return {
      kind: 'original',
      sourceLocale,
      translationAvailable: usable,
      stale: false,
      // A failure need not be brought up to someone reading the original of their
      // own accord: they already have what they came for.
      errorCode: undefined,
    };
  }

  // 3. Up-to-date translation: serve it, with a notice.
  if (usable) {
    return { kind: 'translated', sourceLocale, fields: cached.fields! };
  }

  // 4. and 5. No usable translation. Serve the original, saying
  //    why: stale (the author corrected their text), failed, or
  //    simply never requested.
  return {
    kind: 'original',
    sourceLocale,
    translationAvailable: false,
    stale: cached?.status === 'ready' && !cached.fresh,
    errorCode:
      cached?.status === 'failed' ? (cached.error ?? 'UNKNOWN') : undefined,
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

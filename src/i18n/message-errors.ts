import { IntlErrorCode, type IntlConfig } from 'next-intl';

// Policy for missing message keys (issue #33).
//
// Before: `getMessageFallback` returned the last segment of the path and
// `onError` swallowed MISSING_MESSAGE. A missing interface key therefore
// didn't cost a word — a missing `t('library.detail.notFoundTitle')` displayed
// "notFoundTitle" in the page, in development as in production.
// During PR #4 this silent fallback turned a plain error
// (`getTranslations` failing inside a render boundary) into a puzzle.
//
// The stated reason was sound, the SCOPE too broad. It is vocabulary
// coming from the database — a theme or region slug missing from the dictionary — that
// deserves a fallback, not a label hard-coded in the code. This vocabulary
// now goes through `vocabulary()` (src/i18n/vocabulary.ts), which checks the
// key exists BEFORE requesting it and therefore never reaches this module.
// What arrives here is by construction a missing interface key,
// i.e. a bug:
//
//   development — renders ⟦full.path⟧ + console error: impossible to miss
//   production  — last segment (the page doesn't break) + logged error
//
// The two entries below are shared by both halves of the
// application: `src/i18n/request.ts` for server rendering, and
// `IntlClientProvider` for client components. These settings are
// functions: they do not cross the RSC boundary, so they must be
// set on both sides — otherwise the client half would keep next-intl's
// defaults and the two halves of the site would not react the same way.

// Read at call time, not once and for all at module load: Next.js's
// static replacement of `process.env.NODE_ENV` stays possible,
// and a test can switch from one environment to another.
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

// Full path of the key, as one would search for it in `fr.json` / `en.json`.
export function messagePath(key: string, namespace?: string): string {
  return namespace ? `${namespace}.${key}` : key;
}

// Fallback rendering. The ⟦…⟧ marker looks nothing like a plausible label: it points to
// the faulty key on screen, where "notFoundTitle" passed for content.
export const MISSING_MESSAGE_OPEN = '⟦';
export const MISSING_MESSAGE_CLOSE = '⟧';

export const getMessageFallback: NonNullable<
  IntlConfig['getMessageFallback']
> = ({ error, key, namespace }) => {
  const path = messagePath(key, namespace);

  // Message present but unusable (invalid ICU, formatting error…):
  // `onError` has already reported it, we just return the path — more telling than the
  // last segment when it comes to finding the faulty line.
  if (error.code !== IntlErrorCode.MISSING_MESSAGE) return path;

  // Logged in BOTH environments. In production it is the only way
  // to spot a key nobody noticed missing in development; the
  // full path is enough to find it in the message files.
  console.error(`[i18n] clé de message absente : ${path}`);

  return isProduction() ? (key.split('.').pop() ?? key) : `⟦${path}⟧`;
};

export const onMessageError: NonNullable<IntlConfig['onError']> = (error) => {
  // MISSING_MESSAGE is logged by `getMessageFallback`, which knows the
  // key and its namespace — `error.message` alone doesn't always provide them.
  if (error.code === IntlErrorCode.MISSING_MESSAGE) return;
  console.error(error);
};

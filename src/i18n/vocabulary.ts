// VOCABULARY translation: labels whose key is built from
// a value coming from the database — theme slug (`library.themes.*`), region slug
// (`directory.regions.*`), application status, review stage…
//
// These keys form the only family that DESERVES a fallback (issue #33). The
// vocabulary is duplicated between the backend, the seeds and the messages
// (`THEMES` lives in four files, issue #30): it can therefore diverge, and an
// unexpected slug must not take down the page. Interface labels, on the other hand,
// are hard-coded: a missing key there is always a bug, and
// `src/i18n/message-errors.ts` treats it as such.
//
// The separation comes down to a single rule, checked by
// `tests/unit/i18n-keys.test.ts`:
//
//   literal key, written in full   -> `t('detail.notFoundTitle')`
//   key built at runtime           -> `vocabulary(t, 'themes.', slug)`
//
// `vocabulary()` first asks `t.has(key)`, which answers without throwing or
// logging anything. A missing vocabulary key therefore never reaches
// `getMessageFallback`: the strict fallback stays intact for everything else.

export type VocabularyTranslator = {
  (key: string): string;
  has(key: string): boolean;
};

// Default fallback: the term made readable, rather than the raw slug.
// "gouvernance-numerique" -> "Gouvernance numerique". Without accents or
// polished wording, but presentable — and without ever suggesting it
// is the translated label.
export function humanizeTerm(term: string): string {
  const words = term.replace(/[-_]+/g, ' ').trim();
  if (!words) return term;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Label for a vocabulary term, with an explicit fallback.
 *
 * @param t        namespace translator (`useTranslations` or `getTranslations`)
 * @param prefix   start of the key, separator included: `'themes.'`, `'revStage_'`
 * @param term     the value coming from the database, which completes the key
 * @param fallback fallback label; defaults to `humanizeTerm(term)`
 */
export function vocabulary(
  t: VocabularyTranslator,
  prefix: string,
  term: string,
  fallback?: string,
): string {
  const key = `${prefix}${term}`;
  if (t.has(key)) return t(key);

  // Not an error: the fallback is the expected behaviour. But in
  // development, a term missing from the dictionary almost always signals
  // vocabulary that has diverged between the database and the messages — might as well say so.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[i18n] vocabulaire hors dictionnaire : ${key}`);
  }

  return fallback ?? humanizeTerm(term);
}

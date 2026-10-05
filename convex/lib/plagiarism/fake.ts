import type { ExternalProvider } from './types';

/** Marker the `fake` provider reports as a borrowing (tests and demos only). */
export const FAKE_PLAGIARISM_MARKER = 'FAKE_PLAGIARISM_SOURCE';
/** Marker it reports only when the platform asked for cross-language detection. */
export const FAKE_TRANSLATED_MARKER = 'FAKE_TRANSLATED_SOURCE';

export const fakeProvider: ExternalProvider = {
  name: 'fake',
  async check(plainText, options) {
    const matches = [];
    if (plainText.includes(FAKE_PLAGIARISM_MARKER)) {
      matches.push({
        sourceType: 'web',
        sourceTitle: 'Fake source',
        sourceUrl: 'https://example.org/fake-source',
        passage: FAKE_PLAGIARISM_MARKER,
        similarity: 0.9,
        classification: 'borrowing' as const,
      });
    }
    if (options.crossLanguage && plainText.includes(FAKE_TRANSLATED_MARKER)) {
      matches.push({
        sourceType: 'web',
        sourceTitle: 'Fake translated source',
        sourceUrl: 'https://example.org/fake-translated',
        passage: FAKE_TRANSLATED_MARKER,
        similarity: 0.8,
        classification: 'borrowing' as const,
        crossLanguage: true,
      });
    }
    return {
      status: 'done',
      provider: 'fake',
      matches,
      summary: `${matches.length} match`,
    };
  },
};

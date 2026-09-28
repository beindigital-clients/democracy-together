import { describe, it, expect, vi, beforeEach } from 'vitest';

// F-10 — a Sanity outage must not be mistaken for a missing article.
//
// It is the same distinction as F-02, and here it plays out on a sentinel:
// `undefined` = the request failed, `null` = the article does not exist. Confusing
// them has two opposite consequences, both wrong — rendering
// "indisponible" for an article that was really deleted (which deserves a 404),
// or rendering a 404 during an outage (which would cost the search ranking of a
// very much alive article).
//
// `generateMetadata` is testable WITHOUT a request context: it depends only
// on `params`, the Sanity query and the site URL. It is what
// carries the indexing decision, hence the part of the fix that a review
// cannot verify by eye.

const fetchSanity = vi.fn();
vi.mock('@dt-sanity/lib/client', () => ({
  client: { fetch: (...a: unknown[]) => fetchSanity(...a) },
}));

const { generateMetadata } =
  await import('@/app/[locale]/actualites/[slug]/page');

const params = Promise.resolve({ locale: 'fr', slug: 'un-article' });

beforeEach(() => {
  fetchSanity.mockReset();
});

describe('F-10 — ce que la fiche déclare aux moteurs', () => {
  it('Sanity muet : le rendu dégradé est en noindex', async () => {
    fetchSanity.mockRejectedValue(new Error('sanity injoignable'));
    const m = await generateMetadata({ params });
    // Without this, a search engine crawling during the outage would replace the article
    // with the "indisponible" panel in its index.
    expect(m.robots).toEqual({ index: false, follow: true });
    // `follow` stays true: the page's links keep their value.
    expect(m.title).toBeUndefined();
  });

  it('article absent : PAS de noindex — la page rendra un 404, pas un repli', async () => {
    fetchSanity.mockResolvedValue(null);
    const m = await generateMetadata({ params });
    expect(m.robots).toBeUndefined();
    expect(m.title).toBeUndefined();
  });

  it('article présent : titre, description et canonique, sans noindex', async () => {
    fetchSanity.mockResolvedValue({
      _id: 'a1',
      title: 'Un titre',
      slug: 'un-article',
      language: 'fr',
      excerpt: 'Un résumé.',
      publishedAt: '2026-01-01',
    });
    const m = await generateMetadata({ params });
    expect(m.robots).toBeUndefined();
    expect(m.title).toBe('Un titre');
    expect(m.description).toBe('Un résumé.');
    expect(m.alternates?.canonical).toContain('/fr/actualites/un-article');
  });

  it('la panne est journalisée : le repli ne masque pas le silence du backend', async () => {
    const espion = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchSanity.mockRejectedValue(new Error('boum'));
    await generateMetadata({ params });
    expect(espion).toHaveBeenCalledOnce();
    expect(String(espion.mock.calls[0][0])).toContain('actualites/[slug]');
    espion.mockRestore();
  });
});

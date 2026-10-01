import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CODED_NEWS } from '@convex/lib/contenus/coded/news';

// F-10 — an outage must not be mistaken for a missing article.
//
// It is the same distinction as F-02, and here it plays out on a sentinel:
// `undefined` = the request failed, an answer = the backend spoke. Confusing
// them has two opposite consequences, both wrong — rendering
// "indisponible" for an article that was really deleted (which deserves a 404),
// or rendering a 404 during an outage (which would cost the search ranking of a
// very much alive article).
//
// Since the articles moved to Convex, a third party answers: the coded
// articles, served while the table holds no published article — and during
// an outage, for their own slugs.
//
// `generateMetadata` is testable WITHOUT a request context: it depends only
// on `params`, the Convex query and the site URL. It is what carries the
// indexing decision, hence the part of the fix that a review cannot verify by
// eye.

const fetchQuery = vi.fn();
vi.mock('convex/nextjs', () => ({
  fetchQuery: (...a: unknown[]) => fetchQuery(...a),
}));

const { generateMetadata } =
  await import('@/app/[locale]/actualites/[slug]/page');

const params = (slug: string) => Promise.resolve({ locale: 'fr', slug });
const CODED = CODED_NEWS[0];

beforeEach(() => {
  vi.restoreAllMocks();
  fetchQuery.mockReset();
});

describe('F-10 — ce que la fiche déclare aux moteurs', () => {
  it('Convex muet, article inconnu du code : le rendu dégradé est en noindex', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchQuery.mockRejectedValue(new Error('convex injoignable'));
    const m = await generateMetadata({ params: params('un-article') });
    // Without this, a search engine crawling during the outage would replace the article
    // with the "indisponible" panel in its index.
    expect(m.robots).toEqual({ index: false, follow: true });
    // `follow` stays true: the page's links keep their value.
    expect(m.title).toBeUndefined();
  });

  it('Convex muet, article du code : il est servi, sans noindex', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchQuery.mockRejectedValue(new Error('convex injoignable'));
    const m = await generateMetadata({ params: params(CODED.slug) });
    expect(m.robots).toBeUndefined();
    expect(m.title).toBe(CODED.text.fr.title);
  });

  it('article absent d’une table qui fait foi : PAS de noindex — la page rendra un 404', async () => {
    fetchQuery.mockResolvedValue({ article: null, anyPublished: true });
    // Even a coded slug: an editor deleted it, the table is authoritative.
    const m = await generateMetadata({ params: params(CODED.slug) });
    expect(m.robots).toBeUndefined();
    expect(m.title).toBeUndefined();
  });

  it('table encore vide : les articles du code répondent', async () => {
    fetchQuery.mockResolvedValue({ article: null, anyPublished: false });
    const m = await generateMetadata({ params: params(CODED.slug) });
    expect(m.title).toBe(CODED.text.fr.title);
    expect(await generateMetadata({ params: params('un-article') })).toEqual(
      {},
    );
  });

  it('article présent : titre, description, canonique et autres langues', async () => {
    fetchQuery.mockResolvedValue({
      article: {
        slug: 'un-article',
        title: 'Un titre',
        excerpt: 'Un résumé.',
        publishedOn: '2026-01-01',
        lang: 'fr',
        body: ['Un paragraphe.'],
      },
      anyPublished: true,
    });
    const m = await generateMetadata({ params: params('un-article') });
    expect(m.robots).toBeUndefined();
    expect(m.title).toBe('Un titre');
    expect(m.description).toBe('Un résumé.');
    expect(m.alternates?.canonical).toContain('/fr/actualites/un-article');
    // One slug for the five languages: the English page is the same article.
    expect(m.alternates?.languages).toMatchObject({
      en: expect.stringContaining('/en/actualites/un-article'),
    });
  });

  it('la panne est journalisée : le repli ne masque pas le silence du backend', async () => {
    const espion = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchQuery.mockRejectedValue(new Error('boum'));
    await generateMetadata({ params: params('un-article') });
    expect(espion).toHaveBeenCalledOnce();
    expect(String(espion.mock.calls[0][0])).toContain('contenus/actualite');
    espion.mockRestore();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// F-10 — une panne Sanity ne doit pas se confondre avec un article absent.
//
// C'est la même distinction que F-02, et elle se joue ici sur un sentinelle :
// `undefined` = la requête a échoué, `null` = l'article n'existe pas. Les
// confondre a deux conséquences opposées et toutes deux fausses — rendre
// « indisponible » pour un article réellement supprimé (qui mérite un 404),
// ou rendre un 404 pendant une panne (qui coûterait le référencement d'un
// article bien vivant).
//
// `generateMetadata` est testable SANS contexte de requête : elle ne dépend
// que de `params`, de la requête Sanity et de l'URL du site. C'est elle qui
// porte la décision d'indexation, donc la partie du correctif qu'une relecture
// ne peut pas vérifier à l'œil.

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
    // Sans cela, un moteur qui passe pendant la panne remplacerait l'article
    // par le panneau « indisponible » dans son index.
    expect(m.robots).toEqual({ index: false, follow: true });
    // `follow` reste vrai : les liens de la page gardent leur valeur.
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

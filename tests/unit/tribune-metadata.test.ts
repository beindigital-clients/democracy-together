import { describe, it, expect, vi, beforeEach } from 'vitest';

// Issue #35 — la fiche d'un billet de Tribune. Un billet est rédigé dans UNE
// langue et n'est jamais traduit : les deux préfixes d'URL servent le même
// texte. Ce que ce test tient, ce sont les deux critères d'acceptation qui en
// découlent — un canonical cohérent avec la langue RÉELLE du billet, et aucun
// hreflang vers une traduction inexistante.

const fetchQuery = vi.fn();
vi.mock('convex/nextjs', () => ({
  fetchQuery: (...args: unknown[]) => fetchQuery(...args),
}));

// `@/i18n/navigation` appelle `createNavigation` de next-intl, qui importe
// `next/navigation` — un module que l'exécuteur de tests ne sait pas résoudre
// hors runtime Next. `generateMetadata` ne s'en sert pas : on ne charge donc
// que le strict nécessaire, plutôt que d'installer un alias global pour un
// import que ce test n'exerce pas.
vi.mock('@/i18n/navigation', () => ({
  Link: () => null,
  usePathname: () => '/',
  useRouter: () => ({ replace() {}, push() {}, refresh() {} }),
  redirect: () => undefined,
  getPathname: () => '/',
}));

const { generateMetadata } = await import('@/app/[locale]/tribune/[id]/page');

const SITE = 'http://localhost:3000';

type Post = { title: string; body: string; lang?: 'fr' | 'en' };

function servePost(post: Post | null) {
  fetchQuery.mockResolvedValue(post);
}

function meta(locale: string, id = 'abc123') {
  return generateMetadata({ params: Promise.resolve({ locale, id }) });
}

const frPost: Post = {
  title: 'Budget participatif et redevabilité',
  body: 'x'.repeat(300),
  lang: 'fr',
};

describe('tribune/[id] — canonical dans la langue du billet', () => {
  beforeEach(() => fetchQuery.mockReset());

  it('un billet français canonicalise vers /fr, y compris servi sous /en', async () => {
    servePost(frPost);
    expect((await meta('fr')).alternates?.canonical).toBe(
      `${SITE}/fr/tribune/abc123`,
    );
    servePost(frPost);
    expect((await meta('en')).alternates?.canonical).toBe(
      `${SITE}/fr/tribune/abc123`,
    );
  });

  it('un billet anglais canonicalise vers /en, y compris servi sous /fr', async () => {
    const enPost: Post = { ...frPost, lang: 'en' };
    servePost(enPost);
    expect((await meta('en')).alternates?.canonical).toBe(
      `${SITE}/en/tribune/abc123`,
    );
    servePost(enPost);
    expect((await meta('fr')).alternates?.canonical).toBe(
      `${SITE}/en/tribune/abc123`,
    );
  });

  it('un billet antérieur au champ `lang` retombe sur la langue par défaut', async () => {
    servePost({ title: frPost.title, body: frPost.body });
    expect((await meta('en')).alternates?.canonical).toBe(
      `${SITE}/fr/tribune/abc123`,
    );
  });

  it('ne déclare AUCUN hreflang — la traduction n’existe pas', async () => {
    servePost(frPost);
    const m = await meta('en');
    expect(m.alternates?.languages).toBeUndefined();
  });

  it('billet introuvable : pas de canonical vers une page qui n’existe pas', async () => {
    servePost(null);
    expect(await meta('fr')).toEqual({});
  });
});

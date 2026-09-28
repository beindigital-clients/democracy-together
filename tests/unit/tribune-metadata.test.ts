import { describe, it, expect, vi, beforeEach } from 'vitest';

// Issue #35 — the page of a Tribune post. A post is written in ONE
// language and is never translated: both URL prefixes serve the same
// text. What this test holds are the two acceptance criteria that
// follow — a canonical consistent with the post's ACTUAL language, and no
// hreflang to a nonexistent translation.

const fetchQuery = vi.fn();
vi.mock('convex/nextjs', () => ({
  fetchQuery: (...args: unknown[]) => fetchQuery(...args),
}));

// `@/i18n/navigation` calls next-intl's `createNavigation`, which imports
// `next/navigation` — a module the test runner cannot resolve
// outside the Next runtime. `generateMetadata` does not use it: so we only load
// the bare minimum, rather than installing a global alias for an
// import this test does not exercise.
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

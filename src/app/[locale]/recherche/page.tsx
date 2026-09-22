import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { client } from '@dt-sanity/lib/client';
import { postsQuery } from '@dt-sanity/lib/queries';
import type { PostCardData } from '@/components/news/post-card';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/reveal';
import { countryName, countryFlag } from '@/lib/orgs';
import { vocabulary } from '@/i18n/vocabulary';
import { fetchOrFallback } from '@/lib/convex-fallback';
import { DataUnavailable } from '@/components/ui/data-unavailable';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'search' });
  return {
    title: t('title'),
    description: t('subtitle'),
    // Page de résultats : on n'indexe pas les pages de recherche — une URL
    // par requête saisie n'a aucune valeur pour un moteur, et les laisser
    // entrer dilue l'index du site dans du bruit.
    //
    // C'est aussi la réponse à l'absence d'alternates ici (issue #35) : un
    // `hreflang` est ignoré des moteurs sur une page en `noindex`, l'ajouter
    // ne serait que du bruit de plus. Le `noindex` EST la déclaration ; le
    // canonical, dépouillé du `?q=`, regroupe toutes les recherches d'une
    // locale sur une seule adresse. Retirer `robots` rouvrirait donc les deux
    // problèmes d'un coup — d'où le test qui le tient (tests/e2e/seo.spec.ts).
    robots: { index: false },
    alternates: { canonical: `${SITE}/${locale}/recherche` },
  };
}

const ROW =
  'block rounded-md border border-line bg-surface px-4 py-3 transition-colors hover:border-line-strong hover:bg-accent-tint/40';

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? '';

  const t = await getTranslations('search');
  const tl = await getTranslations('library');

  let publications: { slug: string; title: string; type: string }[] = [];
  let organizations: { slug: string; name: string; country: string }[] = [];
  let posts: PostCardData[] = [];

  // `undefined` = la requête a ÉCHOUÉ, et se distingue d'un résultat vide :
  // afficher « aucun résultat » pendant une panne ferait croire au visiteur
  // que sa recherche ne trouve rien (F-02).
  let indisponible = false;
  if (q.length >= 2) {
    const res = await fetchOrFallback(
      'recherche',
      () => fetchQuery(api.search.globalSearch, { q }),
      undefined,
    );
    if (res === undefined) {
      indisponible = true;
    } else {
      publications = res.publications;
      organizations = res.organizations;
    }
    try {
      const all = await client.fetch<PostCardData[]>(postsQuery, {
        language: locale,
      });
      const needle = q.toLowerCase();
      posts = all
        .filter((p) =>
          `${p.title} ${p.excerpt ?? ''}`.toLowerCase().includes(needle),
        )
        .slice(0, 8);
    } catch {
      /* Sanity injoignable : on garde les résultats Convex */
    }
  }

  const total = publications.length + organizations.length + posts.length;

  return (
    <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-6 md:py-16">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
          {t('eyebrow')}
        </p>
        <h1 className="mt-3 font-display text-[clamp(30px,4vw,46px)] font-medium leading-[1.08] tracking-[-0.02em]">
          {t('title')}
        </h1>
        <form role="search" className="mt-6 flex max-w-xl gap-2">
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            autoFocus
          />
          <Button type="submit" className="shrink-0">
            {t('cta')}
          </Button>
        </form>
      </Reveal>

      {q.length < 2 ? (
        <p className="mt-10 text-ink-soft">{t('prompt')}</p>
      ) : indisponible ? (
        <DataUnavailable className="mt-10" />
      ) : total === 0 ? (
        <p className="mt-10 text-ink-soft">{t('empty', { q })}</p>
      ) : (
        <div className="mt-10 flex flex-col gap-9">
          {publications.length ? (
            <Reveal as="section">
              <h2 className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">
                {t('sectionPublications')}
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {publications.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/bibliotheque/${p.slug}`} className={ROW}>
                      <span className="font-medium text-ink">{p.title}</span>
                      <span className="ml-2 text-[13px] text-muted">
                        {vocabulary(tl, 'types.', p.type)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Reveal>
          ) : null}

          {organizations.length ? (
            <Reveal as="section">
              <h2 className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">
                {t('sectionMembers')}
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {organizations.map((o) => (
                  <li key={o.slug}>
                    <Link href={`/le-reseau/${o.slug}`} className={ROW}>
                      <span className="font-medium text-ink">{o.name}</span>
                      <span className="ml-2 text-[13px] text-muted">
                        {countryFlag(o.country)}{' '}
                        {countryName(o.country, locale)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Reveal>
          ) : null}

          {posts.length ? (
            <Reveal as="section">
              <h2 className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">
                {t('sectionNews')}
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {posts.map((p) => (
                  <li key={p._id}>
                    <Link href={`/actualites/${p.slug}`} className={ROW}>
                      <span className="font-medium text-ink">{p.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Reveal>
          ) : null}
        </div>
      )}
    </div>
  );
}

import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import {
  SEARCH_SOURCES,
  type SearchSourceKey,
} from '@convex/lib/searchSources';
import { PUB_LANGS, PUB_REGIONS, PUB_TYPES } from '@convex/lib/publications';
import { NETWORK_THEMES } from '@convex/lib/themes';
import { client } from '@dt-sanity/lib/client';
import { postsQuery } from '@dt-sanity/lib/queries';
import type { PostCardData } from '@/components/news/post-card';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { Reveal } from '@/components/motion/reveal';
import { vocabulary } from '@/i18n/vocabulary';
import { fetchOrFallback } from '@/lib/convex-fallback';
import { DataUnavailable } from '@/components/ui/data-unavailable';
import {
  hasFilters,
  hitFlag,
  hitLangAttrs,
  hitMeta,
  parseSearchFilters,
  searchHref,
  type SearchHitLike,
} from '@/lib/search';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const PAGE_SIZE = 20;

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
  'flex flex-wrap items-baseline gap-x-2 rounded-md border border-line bg-surface px-4 py-3 transition-colors hover:border-line-strong hover:bg-accent-tint/40';

const YEARS = Array.from(
  { length: new Date().getUTCFullYear() - 2015 + 1 },
  (_, i) => new Date().getUTCFullYear() - i,
);

function isSource(s: string | undefined): s is SearchSourceKey {
  return !!s && (SEARCH_SOURCES as readonly string[]).includes(s);
}

// Recherche globale (F-06) et plein texte (F-34), sur les INDEX de recherche
// Convex (convex/search.ts). Deux vues :
//  - sans `source` : les meilleurs résultats de chaque section du registre,
//    avec un lien « tous les résultats » par section ;
//  - avec `source` : une section seule, PAGINÉE par curseur dans l'URL (rendu
//    serveur, donc sans JavaScript et partageable).
// Les filtres (type, thème, langue, région, année) sont des égalités portées
// par l'index ; ils vivent dans l'URL et s'appliquent aux deux vues.
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
  const first = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
  };
  const q = first('q');
  const filters = parseSearchFilters(sp);
  const sourceParam = first('source');
  const source = isSource(sourceParam) ? sourceParam : undefined;
  const cursor = first('cursor') || null;

  const t = await getTranslations('search');
  const tl = await getTranslations('library');
  const meta = (h: SearchHitLike) =>
    hitMeta(h, { library: tl, search: t, locale });

  type Section = {
    source: SearchSourceKey;
    hits: (SearchHitLike & { id: string })[];
    more: boolean;
  };
  let sections: Section[] = [];
  let nextCursor: string | null = null;
  let posts: PostCardData[] = [];

  // `undefined` = la requête a ÉCHOUÉ, et se distingue d'un résultat vide :
  // afficher « aucun résultat » pendant une panne ferait croire au visiteur
  // que sa recherche ne trouve rien (F-02).
  let indisponible = false;
  if (q.length >= 2) {
    if (source) {
      const res = await fetchOrFallback(
        'recherche',
        () =>
          fetchQuery(api.search.searchBySource, {
            source,
            q,
            filters,
            paginationOpts: { numItems: PAGE_SIZE, cursor },
          }),
        undefined,
      );
      if (res === undefined) indisponible = true;
      else {
        sections = res.page.length
          ? [{ source, hits: res.page, more: !res.isDone }]
          : [];
        nextCursor = res.isDone ? null : res.continueCursor;
      }
    } else {
      const res = await fetchOrFallback(
        'recherche',
        () => fetchQuery(api.search.globalSearch, { q, filters }),
        undefined,
      );
      if (res === undefined) indisponible = true;
      else sections = res.sections;
      // Les actualités (Sanity) : hors registre Convex, sans filtre — elles
      // n'apparaissent que dans la vue d'ensemble non filtrée.
      if (!hasFilters(filters)) {
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
    }
  }

  const total = sections.reduce((n, s) => n + s.hits.length, 0) + posts.length;
  const sectionTitle = (s: string) => vocabulary(t, 'section_', s);
  const anyFilter = hasFilters(filters);

  return (
    <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-6 md:py-16">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
          {t('eyebrow')}
        </p>
        <h1 className="mt-3 font-display text-[clamp(30px,4vw,46px)] font-medium leading-[1.08] tracking-[-0.02em]">
          {t('title')}
        </h1>
        <form role="search" className="mt-6 max-w-2xl">
          <div className="flex gap-2">
            <Input
              type="search"
              name="q"
              defaultValue={q}
              placeholder={t('placeholder')}
              aria-label={t('placeholder')}
              // Étiquette NON visible : `title` la rend lisible au survol et remplit
              // une condition de RGAA 11.1.3 (le placeholder disparaît à la saisie).
              title={t('placeholder')}
              autoFocus
            />
            <Button type="submit" className="shrink-0">
              {t('cta')}
            </Button>
          </div>
          {source ? <input type="hidden" name="source" value={source} /> : null}
          <details className="mt-4" open={anyFilter}>
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-accent-text">
              {t('filters')}
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <SelectField
                label={t('filterType')}
                name="type"
                defaultValue={filters.type ?? ''}
              >
                <option value="">{t('filterAny')}</option>
                {PUB_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {vocabulary(tl, 'types.', v)}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label={t('filterTheme')}
                name="theme"
                defaultValue={filters.theme ?? ''}
              >
                <option value="">{t('filterAny')}</option>
                {NETWORK_THEMES.map((v) => (
                  <option key={v} value={v}>
                    {vocabulary(tl, 'themes.', v)}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label={t('filterLang')}
                name="lang"
                defaultValue={filters.lang ?? ''}
              >
                <option value="">{t('filterAny')}</option>
                {PUB_LANGS.map((v) => (
                  <option key={v} value={v}>
                    {new Intl.DisplayNames([locale], { type: 'language' }).of(
                      v,
                    ) ?? v}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label={t('filterRegion')}
                name="region"
                defaultValue={filters.region ?? ''}
              >
                <option value="">{t('filterAny')}</option>
                {PUB_REGIONS.map((v) => (
                  <option key={v} value={v}>
                    {vocabulary(tl, 'regions.', v)}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label={t('filterYear')}
                name="year"
                defaultValue={filters.year ? String(filters.year) : ''}
              >
                <option value="">{t('filterAny')}</option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </SelectField>
            </div>
            <p className="mt-2 text-xs text-muted">{t('filterNote')}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button type="submit" variant="outline">
                {t('filterApply')}
              </Button>
              {anyFilter ? (
                <Link
                  href={searchHref(q, {}, { source })}
                  className="inline-flex min-h-11 items-center text-sm text-accent-text hover:underline"
                >
                  {t('filterReset')}
                </Link>
              ) : null}
            </div>
          </details>
        </form>
      </Reveal>

      {source ? (
        <p className="mt-6">
          <Link
            href={searchHref(q, filters)}
            className="inline-flex min-h-11 items-center text-sm text-accent-text hover:underline"
          >
            ← {t('backToAll')}
          </Link>
        </p>
      ) : null}

      {q.length < 2 ? (
        <p className="mt-10 break-words text-ink-soft">{t('prompt')}</p>
      ) : indisponible ? (
        <DataUnavailable className="mt-10" />
      ) : total === 0 ? (
        <p className="mt-10 break-words text-ink-soft">{t('empty', { q })}</p>
      ) : (
        <div className="mt-10 flex flex-col gap-9">
          {sections.map((s) => (
            <Reveal as="section" key={s.source}>
              <h2 className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">
                {sectionTitle(s.source)}
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {s.hits.map((h) => {
                  const flag = hitFlag(h);
                  return (
                    <li key={h.id}>
                      <Link href={h.path} className={ROW}>
                        {/* Titre dans sa langue de rédaction (RGAA 8.7). */}
                        <span
                          {...hitLangAttrs(h, locale)}
                          className="min-w-0 wrap-anywhere font-medium text-ink"
                        >
                          {h.title}
                        </span>
                        <span className="text-[13px] text-muted">
                          {/* Le drapeau double le nom du pays : masqué, sans
                              quoi il est lu « drapeau : Sénégal, Sénégal ». */}
                          {flag ? (
                            <>
                              <span aria-hidden="true">{flag}</span>{' '}
                            </>
                          ) : null}
                          {meta(h)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {!source && s.more ? (
                <Link
                  href={searchHref(q, filters, { source: s.source })}
                  className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline"
                >
                  {t('sectionAll', { section: sectionTitle(s.source) })}
                </Link>
              ) : null}
            </Reveal>
          ))}

          {source && (nextCursor || cursor) ? (
            <div className="flex flex-wrap gap-4">
              {cursor ? (
                <Link
                  href={searchHref(q, filters, { source })}
                  className="inline-flex min-h-11 items-center text-sm text-accent-text hover:underline"
                >
                  {t('firstPage')}
                </Link>
              ) : null}
              {nextCursor ? (
                <Link
                  href={searchHref(q, filters, { source, cursor: nextCursor })}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline"
                >
                  {t('nextPage')}
                </Link>
              ) : null}
            </div>
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
                      <span className="min-w-0 wrap-anywhere font-medium text-ink">
                        {p.title}
                      </span>
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

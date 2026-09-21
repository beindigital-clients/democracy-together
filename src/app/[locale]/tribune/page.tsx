import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { resolveLocale } from '@/i18n/locale';
import { PUB_THEMES } from '@/lib/publications';
import { isNetworkTheme } from '@convex/lib/themes';
import { TribuneComposer } from '@/components/tribune/tribune-composer';
import { vocabulary } from '@/i18n/vocabulary';
import { fetchOrFallback, EMPTY_TRIBUNE_POSTS } from '@/lib/convex-fallback';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

function param(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() ? v.trim() : undefined;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tribune' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${SITE}/${locale}/tribune`,
      languages: {
        fr: `${SITE}/fr/tribune`,
        en: `${SITE}/en/tribune`,
        'x-default': `${SITE}/fr/tribune`,
      },
    },
  };
}

export default async function TribunePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = resolveLocale(locale);
  const sp = await searchParams;
  // Le paramètre d'URL est libre, l'argument de la query ne l'est pas : une
  // valeur hors vocabulaire est ramenée à « pas de filtre » ici, plutôt que
  // de partir telle quelle et de faire échouer la validation d'arguments.
  const raw = param(sp.theme);
  const theme = raw && isNetworkTheme(raw) ? raw : undefined;

  const t = await getTranslations('tribune');
  const tl = await getTranslations('library');
  // Backend injoignable -> aucun billet, pas un 500 (F-02).
  const posts = await fetchOrFallback(
    'tribune',
    () => fetchQuery(api.tribune.listPosts, { theme }),
    EMPTY_TRIBUNE_POSTS,
  );

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(loc, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-12 sm:px-6 md:py-16">
      <header className="max-w-[64ch]">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
            {t('eyebrow')}
          </p>
          <h1 className="mt-3 font-display text-[clamp(30px,4vw,46px)] font-medium leading-[1.08] tracking-[-0.02em]">
            {t('title')}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            {t('lead')}
          </p>
        </Reveal>
      </header>

      {/* Code de conduite (F-50) + prise de parole */}
      <Reveal className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div>
          <TribuneComposer />
        </div>
        <aside className="rounded-md border border-line bg-surface p-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
            {t('conductTitle')}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            {t('conductBody')}
          </p>
        </aside>
      </Reveal>

      {/* Filtre par thématique */}
      <Reveal className="mt-10">
        <div
          role="group"
          aria-label={t('filterLabel')}
          className="flex flex-wrap gap-2"
        >
          <Link
            href="/tribune"
            aria-current={!theme ? 'true' : undefined}
            className={`rounded-pill border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              !theme
                ? 'border-accent bg-accent text-accent-contrast'
                : 'border-line-strong bg-surface text-ink-soft hover:text-ink'
            }`}
          >
            {t('allThemes')}
          </Link>
          {PUB_THEMES.map((s) => {
            const active = theme === s;
            return (
              <Link
                key={s}
                href={{ pathname: '/tribune', query: { theme: s } }}
                aria-current={active ? 'true' : undefined}
                className={`rounded-pill border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? 'border-accent bg-accent text-accent-contrast'
                    : 'border-line-strong bg-surface text-ink-soft hover:text-ink'
                }`}
              >
                {vocabulary(tl, 'themes.', s)}
              </Link>
            );
          })}
        </div>
      </Reveal>

      {/* Fil */}
      {posts.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
          <p className="text-ink-soft">{t('empty')}</p>
        </div>
      ) : (
        <RevealGroup as="ul" className="mt-8 flex flex-col gap-4">
          {posts.map((p) => (
            <RevealItem as="li" key={p._id}>
              <Link
                href={`/tribune/${p._id}`}
                className="block rounded-md border border-line bg-surface p-5 transition-colors hover:border-ink"
              >
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="rounded-pill border border-accent-edge bg-accent-tint px-2.5 py-0.5 font-medium text-accent-text">
                    {vocabulary(tl, 'themes.', p.theme)}
                  </span>
                  <span className="font-mono uppercase tracking-[0.06em] text-muted">
                    {vocabulary(t, 'format_', p.format)}
                  </span>
                </div>
                <h2 className="mt-2 font-display text-xl leading-snug">
                  {p.title}
                </h2>
                <p className="mt-1.5 line-clamp-2 text-[15px] leading-relaxed text-ink-soft">
                  {p.excerpt}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
                  <span>{p.authorName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{fmtDate(p.createdAt)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t('commentsCount', { count: p.commentCount })}</span>
                </div>
              </Link>
            </RevealItem>
          ))}
        </RevealGroup>
      )}
    </div>
  );
}

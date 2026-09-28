import type { Metadata } from 'next';
import { hreflangFor } from '@/lib/seo';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { Badge } from '@/components/ui/badge';
import { resolveLocale } from '@/i18n/locale';
import {
  parseReplayFilters,
  filterReplays,
  replayFacets,
  replaysHref,
  hasReplayFilters,
  type ReplayFilters,
  type ReplayFacet,
} from '@/lib/replays';
import { monthAbbr } from '@/lib/events-content';
import { loadReplays } from '@/lib/contenus/load';
import { ArrowForward } from '@/components/ui/arrow';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'replays' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${SITE}/${locale}/replays`,
      languages: hreflangFor(`replays`),
    },
  };
}

// Filter chip — same shape as the directory: a GET link, `aria-current`
// when active, so usable without JavaScript and shareable.
function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-accent-edge bg-accent-tint text-accent-text'
          : 'border-line bg-surface-2 text-ink-soft hover:border-line-strong hover:text-ink'
      }`}
    >
      {children}
    </Link>
  );
}

function FacetGroup({
  legend,
  all,
  items,
  filters,
  keyName,
}: {
  legend: string;
  all: string;
  items: ReplayFacet[];
  filters: ReplayFilters;
  keyName: keyof ReplayFilters;
}) {
  return (
    <fieldset>
      <legend className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        <Chip
          href={replaysHref(filters, { [keyName]: undefined })}
          active={!filters[keyName]}
        >
          {all}
        </Chip>
        {items.map((f) => (
          <Chip
            key={f.value}
            href={replaysHref(filters, { [keyName]: f.value })}
            active={filters[keyName] === f.value}
          >
            {f.label}
            <span className="text-muted">{f.count}</span>
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

export default async function ReplaysPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = resolveLocale(locale);
  const t = await getTranslations('replays');
  // Replays: the `contentReplays` table, or the hard-coded fallback catalogue
  // (empty table, backend unreachable) — see src/lib/contenus/load.ts.
  const { items: all } = await loadReplays(loc);
  // Type / theme / language filters in the URL (community A-12). The
  // facets are counted over the whole set, the list over the selection.
  const filters = parseReplayFilters(await searchParams, all);
  const facets = replayFacets(all, loc);
  const replays = filterReplays(all, filters);
  const filtered = hasReplayFilters(filters);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 md:py-16">
      <header className="max-w-[62ch]">
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

      {all.length > 0 ? (
        <section aria-label={t('filtersLabel')} className="mt-10 space-y-5">
          <FacetGroup
            legend={t('filterType')}
            all={t('all')}
            items={facets.types}
            filters={filters}
            keyName="type"
          />
          <FacetGroup
            legend={t('filterTheme')}
            all={t('all')}
            items={facets.themes}
            filters={filters}
            keyName="theme"
          />
          <FacetGroup
            legend={t('filterLang')}
            all={t('all')}
            items={facets.langs}
            filters={filters}
            keyName="lang"
          />
          <div className="flex items-center justify-between gap-4">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">
              {t('count', { count: replays.length })}
            </p>
            {filtered ? (
              <Link
                href="/replays"
                className="shrink-0 text-sm text-accent-text hover:underline"
              >
                {t('reset')}
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {replays.length === 0 ? (
        <Reveal>
          <p className="mt-6 rounded-sm border border-line bg-surface p-8 text-center text-ink-soft">
            {filtered ? t('emptyFiltered') : t('empty')}
          </p>
        </Reveal>
      ) : (
        <RevealGroup
          as="ul"
          className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3"
        >
          {replays.map((r) => (
            <RevealItem as="li" key={r.slug}>
              <article className="flex h-full flex-col rounded-sm border border-line bg-surface p-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge>{r.type}</Badge>
                    <Badge variant="accent">{r.theme}</Badge>
                  </span>
                  <span className="font-mono text-xs uppercase tracking-[0.06em] text-muted">
                    {r.d} {monthAbbr({ mo: r.mo }, loc)} {r.y}
                    {r.durationMin != null
                      ? ` · ${t('durationLabel', { count: r.durationMin })}`
                      : ''}
                  </span>
                </div>
                <h2 className="mt-3 font-display text-xl leading-snug wrap-anywhere">
                  {r.title}
                </h2>
                {r.description ? (
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft wrap-anywhere">
                    {r.description}
                  </p>
                ) : null}
                {r.embedUrl ? (
                  // Embedded player: YouTube on the "nocookie" domain, Vimeo.
                  // The URL is computed server-side from a link validated
                  // against its platform (`validateVideoUrl`).
                  <div className="relative mt-4 aspect-video overflow-hidden rounded-sm border border-line bg-paper">
                    <iframe
                      src={r.embedUrl}
                      title={t('playerTitle', { title: r.title })}
                      loading="lazy"
                      allow="encrypted-media; picture-in-picture; fullscreen"
                      referrerPolicy="strict-origin-when-cross-origin"
                      className="absolute inset-0 h-full w-full"
                    />
                  </div>
                ) : r.videoKind === 'file' && r.videoUrl ? (
                  <video
                    controls
                    preload="none"
                    src={r.videoUrl}
                    aria-label={t('playerTitle', { title: r.title })}
                    className="mt-4 w-full rounded-sm border border-line bg-paper"
                  />
                ) : r.videoUrl ? (
                  <a
                    href={r.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-sm bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
                  >
                    {t('watch')}
                  </a>
                ) : (
                  <div className="mt-4 flex items-center gap-2 rounded-sm border border-dashed border-line bg-paper px-3 py-2.5 text-sm text-muted">
                    <span aria-hidden="true">●</span>
                    <span>{t('soon')}</span>
                  </div>
                )}
                {r.eventSlug ? (
                  <Link
                    href={`/evenements/${r.eventSlug}`}
                    className="mt-4 inline-block py-2 text-sm font-semibold text-accent-text hover:underline"
                  >
                    {t('viewEvent')} <ArrowForward />
                  </Link>
                ) : null}
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      )}
    </div>
  );
}

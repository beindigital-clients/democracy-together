import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/reveal';
import { AuthorList } from '@/components/library/author-list';
import { CiteBlock } from '@/components/library/cite-block';
import { CopyButton } from '@/components/library/copy-button';
import { PublicationCard } from '@/components/library/publication-card';
import { ViewCounter } from '@/components/library/view-counter';
import { buildCitations, formatLongDate } from '@/lib/publications';
import { vocabulary } from '@/i18n/vocabulary';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  // Volontairement NON authentifié : les métadonnées doivent être identiques
  // pour tous (SEO, cache CDN). Pour une publication réservée, Convex renvoie
  // déjà l'amorce de résumé tronquée — rien de réservé ne fuite ici (F-35).
  const pub = await fetchQuery(api.publications.getBySlug, { slug });
  if (!pub) return {};
  return {
    title: pub.title,
    description: pub.abstract,
    alternates: {
      canonical: `${SITE}/${locale}/bibliotheque/${slug}`,
      languages: {
        fr: `${SITE}/fr/bibliotheque/${slug}`,
        en: `${SITE}/en/bibliotheque/${slug}`,
        'x-default': `${SITE}/fr/bibliotheque/${slug}`,
      },
    },
  };
}

const WRAP = 'mx-auto w-full max-w-[1180px] px-4 sm:px-6';

export default async function PublicationPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  // Le jeton de session est transmis à Convex : c'est lui qui décide si le
  // lecteur a les droits « membre » et donc si le contenu réservé est servi
  // (F-35). Sans jeton, Convex verrouille — le gating n'est jamais côté client.
  const token = await convexAuthNextjsToken();
  const pub = await fetchQuery(api.publications.getBySlug, { slug }, { token });
  if (!pub) notFound();

  const t = await getTranslations('library');
  const td = await getTranslations('library.detail');
  const related = await fetchQuery(
    api.publications.relatedByTheme,
    {
      theme: pub.theme,
      excludeSlug: pub.slug,
      limit: 3,
    },
    { token },
  );

  const citations = buildCitations(pub, locale);
  const doiUrl = `https://doi.org/${pub.doi}`;
  // Document téléversé (F-32) si présent, sinon repli sur le DOI.
  const fileHref = pub.fileUrl ?? doiUrl;
  const langNames = pub.languages
    .map((l) => vocabulary(t, 'langs.', l))
    .join(', ');
  const langCodes = pub.languages.map((l) => l.toUpperCase()).join(', ');

  const subParts = [
    td('publishedOn', { date: formatLongDate(pub.publishedAt, locale) }),
    ...(pub.pages ? [td('pages', { count: pub.pages })] : []),
    langNames,
    `DOI ${pub.doi}`,
  ];

  return (
    <div>
      {/* Compteur de consultations (F-37) — îlot client invisible. */}
      <ViewCounter slug={pub.slug} />
      {/* Fil d'Ariane */}
      <div className={`${WRAP} pt-8`}>
        <p className="text-[13px] text-muted">
          <Link href="/" className="text-muted hover:text-ink">
            {t('breadcrumbHome')}
          </Link>{' '}
          /{' '}
          <Link href="/bibliotheque" className="text-muted hover:text-ink">
            {t('title')}
          </Link>{' '}
          / {vocabulary(t, 'themes.', pub.theme)}
        </p>
      </div>

      {/* En-tête publication */}
      <header className="border-b border-line">
        <div className={`${WRAP} pb-12 pt-6`}>
          <Reveal>
            <div className="mb-4 flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-muted">
                {vocabulary(t, 'types.', pub.type)}
              </span>
              <span className="inline-flex items-center rounded-pill border border-accent-edge bg-accent-tint px-3 py-1 text-[12.5px] font-medium text-accent-text">
                {vocabulary(t, 'themes.', pub.theme)}
              </span>
              <span className="rounded-pill border border-[color-mix(in_srgb,var(--color-bar-1)_40%,transparent)] px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-bar-1">
                {vocabulary(t, 'accessShort.', pub.access)}
              </span>
            </div>
            <h1 className="max-w-[22ch] font-display text-[clamp(30px,4.2vw,48px)] font-medium leading-[1.08] tracking-[-0.015em]">
              {pub.title}
            </h1>
            <p className="mt-5 text-[15px] text-ink-soft">
              {td('by')}{' '}
              <AuthorList
                names={pub.authors.map((a) => a.name)}
                locale={locale}
              />
            </p>
            <p className="mt-1.5 text-sm text-muted">{subParts.join(' · ')}</p>
            {/* Compteur de consultations (F-37) — rendu serveur depuis pub.views. */}
            <p className="mt-1 text-[13px] text-muted">
              {t('views', { count: pub.views })}
            </p>
          </Reveal>
        </div>
      </header>

      {/* Corps */}
      <main
        className={`${WRAP} grid gap-12 pb-24 pt-12 lg:grid-cols-[1fr_340px]`}
      >
        {/* Article */}
        <article>
          <Reveal>
            <h2 className="font-display text-2xl">{td('abstract')}</h2>
            <p className="mt-4 max-w-[68ch] font-display text-xl leading-relaxed text-ink">
              {pub.abstract}
            </p>
          </Reveal>

          {pub.keypoints.length ? (
            <Reveal className="mt-12">
              <h2 className="font-display text-2xl">{td('keypoints')}</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {pub.keypoints.map((kp) => (
                  <li
                    key={kp}
                    className="relative max-w-[68ch] pl-7 text-base leading-relaxed text-ink-soft before:absolute before:left-0 before:top-2.5 before:h-2 before:w-2 before:rounded-full before:bg-accent"
                  >
                    {kp}
                  </li>
                ))}
              </ul>
            </Reveal>
          ) : null}

          {pub.image ? (
            <Reveal className="my-8 block" as="div">
              <figure className="my-6">
                <div className="relative aspect-[16/9] overflow-hidden rounded-sm border border-line bg-surface-2">
                  <Image
                    src={pub.image}
                    alt=""
                    fill
                    sizes="(max-width: 880px) 100vw, 760px"
                    className="object-cover"
                  />
                </div>
                <figcaption className="mt-2 text-[12.5px] text-muted">
                  {vocabulary(t, 'types.', pub.type)} ·{' '}
                  {vocabulary(t, 'themes.', pub.theme)} · Democracy Together
                </figcaption>
              </figure>
            </Reveal>
          ) : null}

          {pub.body.length ? (
            <Reveal>
              <h2 className="font-display text-2xl">{td('extract')}</h2>
              <div className="mt-4">
                {pub.body.map((para) => (
                  <p
                    key={para.slice(0, 24)}
                    className="mb-4 max-w-[68ch] font-display text-lg leading-[1.7] text-ink"
                  >
                    {para}
                  </p>
                ))}
              </div>
            </Reveal>
          ) : null}

          <CiteBlock citations={citations} />

          {/* Auteurs */}
          <div className="mt-12 flex flex-wrap gap-6 border-t border-line pt-8">
            {pub.authors.map((a) => (
              <div key={a.name} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="grid h-12 w-12 place-items-center rounded-full bg-accent-tint font-mono font-semibold text-accent-text"
                >
                  {initials(a.name)}
                </span>
                <div>
                  <b className="text-[14.5px]">{a.name}</b>
                  {a.role ? (
                    <span className="block text-[12.5px] text-muted">
                      {a.role}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </article>

        {/* Sidebar */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-sm border border-line bg-surface p-5">
            {/* Publication réservée aux membres (F-35) : `locked` est décidé par
                Convex, jamais par le client. Aucune URL de document n'est servie
                ici — on propose l'adhésion à la place du téléchargement. */}
            {pub.locked ? (
              <div className="flex flex-col gap-3">
                <h2 className="font-display text-lg leading-snug">
                  {td('lockedTitle')}
                </h2>
                <p className="text-[13.5px] leading-relaxed text-ink-soft">
                  {td('lockedBody')}
                </p>
                <Link
                  href="/adhesion"
                  className="inline-flex w-full items-center justify-center rounded-sm bg-accent px-4 py-3 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
                >
                  {td('lockedCta')}
                </Link>
                <Link
                  href="/connexion"
                  className="inline-flex w-full items-center justify-center rounded-sm border border-line-strong px-4 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
                >
                  {td('lockedSignIn')}
                </Link>
                <a
                  href="#cite"
                  className="inline-flex w-full items-center justify-center rounded-sm px-4 py-3 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-tint"
                >
                  {td('cite')}
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <a
                  href={fileHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-sm bg-accent px-4 py-3 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
                >
                  {td('download')}
                </a>
                <a
                  href={fileHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-sm border border-line-strong px-4 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
                >
                  {td('readOnline')}
                </a>
                <a
                  href="#cite"
                  className="inline-flex w-full items-center justify-center rounded-sm px-4 py-3 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-tint"
                >
                  {td('cite')}
                </a>
              </div>
            )}
            <div className="mt-4 flex items-center gap-2 rounded-sm border border-line bg-surface-2 px-2.5 py-2 font-mono text-xs text-ink-soft">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                doi.org/{pub.doi}
              </span>
              <CopyButton
                text={doiUrl}
                copiedLabel={td('copied')}
                className="ml-auto shrink-0 rounded-[3px] border border-line-strong bg-surface px-2 py-1 text-[11px] font-semibold text-ink-soft"
              >
                {td('copy')}
              </CopyButton>
            </div>
          </div>

          <div className="rounded-sm border border-line bg-surface p-5">
            <h2 className="mb-4 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
              {td('metadata')}
            </h2>
            <dl className="flex flex-col">
              <MetaRow
                k={td('metaType')}
                v={vocabulary(t, 'types.', pub.type)}
                first
              />
              <MetaRow
                k={td('metaPublished')}
                v={formatLongDate(pub.publishedAt, locale)}
              />
              <MetaRow k={td('metaLanguages')} v={langCodes} />
              <MetaRow
                k={td('metaRegion')}
                v={vocabulary(t, 'regions.', pub.region)}
              />
              <MetaRow
                k={td('metaTheme')}
                v={vocabulary(t, 'themes.', pub.theme)}
              />
              {pub.pages ? (
                <MetaRow k={td('metaPages')} v={String(pub.pages)} />
              ) : null}
              {pub.license ? (
                <MetaRow k={td('metaLicense')} v={pub.license} />
              ) : null}
            </dl>
          </div>

          <div className="rounded-sm border border-line bg-surface p-5">
            <h2 className="mb-4 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
              {td('impact')}
            </h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              {pub.views ? (
                <Metric n={pub.views.toLocaleString(locale)} l={td('views')} />
              ) : null}
              <Metric
                n={pub.downloads.toLocaleString(locale)}
                l={td('downloadsShort')}
              />
              <Metric n={String(pub.citations)} l={td('citationsShort')} />
            </div>
          </div>
        </aside>
      </main>

      {/* Liées */}
      {related.length ? (
        <section className="border-t border-line">
          <div className={`${WRAP} py-16`}>
            <Reveal>
              <h2 className="mb-6 font-display text-2xl">{td('related')}</h2>
            </Reveal>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((rp) => (
                <PublicationCard
                  key={rp._id}
                  pub={rp}
                  locale={locale}
                  variant="compact"
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function MetaRow({ k, v, first }: { k: string; v: string; first?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-4 py-2.5 text-[13.5px] ${
        first ? '' : 'border-t border-line'
      }`}
    >
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-medium text-ink">{v}</dd>
    </div>
  );
}

function Metric({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="font-mono text-[22px] font-semibold text-ink">{n}</div>
      <div className="mt-0.5 text-[11px] text-muted">{l}</div>
    </div>
  );
}

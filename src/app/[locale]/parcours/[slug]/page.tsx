import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { alternatesFor } from '@/lib/seo';
import { vocabulary } from '@/i18n/vocabulary';
import { fetchOrFallback } from '@/lib/convex-fallback';
import { DataUnavailable } from '@/components/ui/data-unavailable';
import { PathSteps } from '@/components/toolbox/path-steps';

// Learning path (F-57): ordered steps, progress and certificate for a
// signed-in account.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const path = await fetchOrFallback(
    'parcours/[slug]:metadata',
    () => fetchQuery(api.toolbox.getPath, { slug }),
    null,
  );
  if (!path) return {};
  return {
    title: path.title,
    description: path.summary.slice(0, 200),
    alternates: alternatesFor(locale, `parcours/${slug}`),
  };
}

export default async function PathPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const path = await fetchOrFallback(
    'parcours/[slug]',
    () => fetchQuery(api.toolbox.getPath, { slug }),
    undefined,
  );
  if (path === undefined)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <DataUnavailable />
      </div>
    );
  if (!path) notFound();
  const t = await getTranslations('toolbox');
  const tl = await getTranslations('library');
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:py-16">
      <p className="text-[13px] text-muted">
        <Link href="/boite-a-outils" className="hover:text-ink">
          {t('title')}
        </Link>{' '}
        /{' '}
        <Link href="/parcours" className="hover:text-ink">
          {t('pathsTitle')}
        </Link>
      </p>
      <h1 className="mt-4 wrap-anywhere font-display text-[clamp(28px,3.6vw,42px)] font-medium leading-[1.1] tracking-[-0.02em]">
        {path.title}
      </h1>
      <p className="mt-2 text-[14px] text-muted">
        {vocabulary(t, 'level_', path.level)} ·{' '}
        {vocabulary(tl, 'langs.', path.language)} ·{' '}
        {t('stepsCount', { count: path.steps })}
      </p>
      <p className="mt-4 whitespace-pre-line wrap-anywhere text-lg leading-relaxed text-ink-soft">
        {path.summary}
      </p>
      <div className="mt-8">
        <PathSteps path={path} />
      </div>
    </div>
  );
}

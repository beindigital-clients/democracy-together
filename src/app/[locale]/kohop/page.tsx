import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { KOHOP_FIELDS, KOHOP_LANGS } from '@convex/lib/kohop';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/reveal';
import { DataUnavailable } from '@/components/ui/data-unavailable';
import { PublicCard } from '@/components/kohop/public-card';
import { fetchOrFallback } from '@/lib/convex-fallback';
import { alternatesFor } from '@/lib/seo';
import { vocabulary } from '@/i18n/vocabulary';
import { cn } from '@/lib/utils';

const WRAP = 'mx-auto w-full max-w-[1180px] px-4 sm:px-6';

// While the access is the pilot one, the public space is open to readers and
// closed to search engines (`noindex`): it opens to them with the access.
async function isIndexable(): Promise<boolean> {
  return await fetchOrFallback(
    'kohop:indexable',
    () => fetchQuery(api.kohopPublic.indexable, {}),
    false,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'kohopPublic' });
  const indexable = await isIndexable();
  return {
    title: t('listTitle'),
    description: t('listLead'),
    alternates: alternatesFor(locale, 'kohop'),
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

function href(field?: string, lang?: string) {
  const q = new URLSearchParams();
  if (field) q.set('field', field);
  if (lang) q.set('lang', lang);
  const s = q.toString();
  return s ? `/kohop?${s}` : '/kohop';
}

export default async function KohopListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const rawField = typeof sp.field === 'string' ? sp.field : undefined;
  const rawLang = typeof sp.lang === 'string' ? sp.lang : undefined;
  // Only known values reach the query: anything else is "no filter".
  const field = KOHOP_FIELDS.find((f) => f === rawField);
  const lang = KOHOP_LANGS.find((l) => l === rawLang);

  const t = await getTranslations('kohopPublic');
  const tk = await getTranslations('kohop');
  const items = await fetchOrFallback(
    'kohop:list',
    () => fetchQuery(api.kohopPublic.list, { field, lang }),
    undefined,
  );

  const chip = (active: boolean) =>
    cn(
      'inline-flex min-h-9 items-center rounded-pill border px-3.5 py-1 text-sm transition-colors',
      active
        ? 'border-accent bg-accent-tint text-accent-text'
        : 'border-line-strong text-ink-soft hover:border-ink hover:text-ink',
    );

  return (
    <div>
      <div className={`${WRAP} pt-8`}>
        <p className="text-[13px] text-muted">
          <Link href="/" className="text-muted hover:text-ink">
            {t('breadcrumbHome')}
          </Link>{' '}
          / KOHOP
        </p>
      </div>
      <header className="border-b border-line">
        <div className={`${WRAP} pb-10 pt-6`}>
          <Reveal>
            <h1 className="max-w-[24ch] font-display text-[clamp(30px,4.2vw,48px)] font-medium leading-[1.08] tracking-[-0.015em]">
              {t('listTitle')}
            </h1>
            <p className="mt-4 max-w-[68ch] text-lg text-ink-soft">
              {t('listLead')}
            </p>
          </Reveal>
        </div>
      </header>

      <div className={`${WRAP} pb-24 pt-8`}>
        <nav aria-label={t('filtersLabel')} className="space-y-4">
          <div>
            <p className="text-sm font-medium text-ink">{t('filterField')}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              <li>
                <Link
                  href={href(undefined, lang)}
                  aria-current={field ? undefined : 'true'}
                  className={chip(!field)}
                >
                  {t('filterAll')}
                </Link>
              </li>
              {KOHOP_FIELDS.map((f) => (
                <li key={f}>
                  <Link
                    href={href(f, lang)}
                    aria-current={field === f ? 'true' : undefined}
                    className={chip(field === f)}
                  >
                    {vocabulary(tk, 'field_', f)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-ink">{t('filterLang')}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              <li>
                <Link
                  href={href(field, undefined)}
                  aria-current={lang ? undefined : 'true'}
                  className={chip(!lang)}
                >
                  {t('filterAll')}
                </Link>
              </li>
              {KOHOP_LANGS.map((l) => (
                <li key={l}>
                  <Link
                    href={href(field, l)}
                    aria-current={lang === l ? 'true' : undefined}
                    className={chip(lang === l)}
                  >
                    {vocabulary(tk, 'lang_', l)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {field || lang ? (
            <p>
              <Link
                href="/kohop"
                className="text-sm font-medium text-accent-text hover:underline"
              >
                {t('filtersReset')}
              </Link>
            </p>
          ) : null}
        </nav>

        <section className="mt-10" aria-label={t('listTitle')}>
          {items === undefined ? (
            <DataUnavailable />
          ) : items.length === 0 ? (
            <p className="max-w-[62ch] rounded-md border border-line bg-surface p-6 text-ink-soft">
              {t('empty')}
            </p>
          ) : (
            <ul className="grid gap-4">
              {items.map((item) => (
                <li key={item.slug} className="relative">
                  <PublicCard item={item} locale={locale} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

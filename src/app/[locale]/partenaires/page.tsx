import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { routing } from '@/i18n/routing';
import { getPartners } from '@/lib/partners-content';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

function resolve(locale: string): 'fr' | 'en' {
  return (hasLocale(routing.locales, locale) ? locale : routing.defaultLocale) as
    | 'fr'
    | 'en';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'partners' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${SITE}/${locale}/partenaires`,
      languages: {
        fr: `${SITE}/fr/partenaires`,
        en: `${SITE}/en/partenaires`,
        'x-default': `${SITE}/fr/partenaires`,
      },
    },
  };
}

export default async function PartenairesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = resolve(locale);
  const t = await getTranslations('partners');
  const categories = getPartners(loc);

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

      <RevealGroup as="ul" className="mt-10 grid gap-5 md:grid-cols-2">
        {categories.map((c, i) => (
          <RevealItem as="li" key={c.slug}>
            <article className="flex h-full flex-col rounded-sm border border-line bg-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-accent-text">
                  {String(i + 1).padStart(2, '0')} · {c.kicker}
                </span>
              </div>
              <h2 className="mt-3 font-display text-2xl leading-tight">
                {c.title}
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
                {c.summary}
              </p>
              <dl className="mt-5 grid gap-4 border-t border-line pt-5">
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                    {t('givesLabel')}
                  </dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                    {c.gives}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                    {t('getsLabel')}
                  </dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                    {c.gets}
                  </dd>
                </div>
              </dl>
            </article>
          </RevealItem>
        ))}
      </RevealGroup>

      <Reveal>
        <section className="mt-12 rounded-sm border border-accent-edge bg-accent-tint p-8 md:mt-16 md:p-10">
          <div className="max-w-[60ch]">
            <h2 className="font-display text-2xl font-medium leading-tight md:text-3xl">
              {t('ctaTitle')}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
              {t('ctaBody')}
            </p>
            <Button asChild className="mt-6 self-start">
              <Link href="/contact">{t('ctaPrimary')}</Link>
            </Button>
          </div>
        </section>
      </Reveal>
    </div>
  );
}

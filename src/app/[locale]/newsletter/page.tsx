import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { NewsletterForm } from '@/components/newsletter/newsletter-form';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'newsletter' });
  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: {
      canonical: `${SITE}/${locale}/newsletter`,
      languages: {
        fr: `${SITE}/fr/newsletter`,
        en: `${SITE}/en/newsletter`,
        'x-default': `${SITE}/fr/newsletter`,
      },
    },
  };
}

export default async function NewsletterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('newsletter');
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
        {t('eyebrow')}
      </p>
      <h1 className="mt-3 font-display text-[clamp(30px,4vw,46px)] font-medium leading-[1.08] tracking-[-0.02em]">
        {t('title')}
      </h1>
      <p className="mt-4 max-w-[58ch] text-lg leading-relaxed text-ink-soft">
        {t('subtitle')}
      </p>
      <div className="mt-8 max-w-md">
        <NewsletterForm placeholder={t('placeholder')} cta={t('cta')} />
      </div>
      <p className="mt-4 text-xs text-muted">{t('privacy')}</p>
    </div>
  );
}

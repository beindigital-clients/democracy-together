import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { hreflangFor } from '@/lib/seo';
import { CercleRequestForm } from '@/components/cercle/cercle-request-form';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'cercle' });
  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: {
      canonical: `${SITE}/${locale}/cercle`,
      languages: hreflangFor('cercle'),
    },
  };
}

// PUBLIC page: the presentation of the Cercle and the request form. It shows
// nothing from the Cercle's private space — that lives under
// /espace-membre/cercle, behind sign-in and a server-side access check.
export default async function CerclePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('cercle');
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
        {t('eyebrow')}
      </p>
      <h1 className="mt-3 font-display text-[clamp(30px,4vw,46px)] font-medium leading-[1.08] tracking-[-0.02em]">
        {t('title')}
      </h1>
      <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-ink-soft">
        {t('subtitle')}
      </p>

      <h2 className="mt-10 font-display text-xl text-ink">{t('howTitle')}</h2>
      <ol className="mt-3 list-decimal space-y-2 ps-5 text-[15px] leading-relaxed text-ink-soft">
        <li>{t('how1')}</li>
        <li>{t('how2')}</li>
        <li>{t('how3')}</li>
      </ol>

      <div className="mt-10">
        <CercleRequestForm />
      </div>
    </div>
  );
}

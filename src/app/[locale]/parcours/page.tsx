import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { hreflangFor } from '@/lib/seo';
import { Link } from '@/i18n/navigation';
import { PathList } from '@/components/toolbox/toolbox-catalog';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

// Index des parcours d'apprentissage (F-57). Le segment `/parcours` existe
// pour que `/parcours/<slug>` ait un parent navigable.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'toolbox' });
  return {
    title: t('pathsTitle'),
    description: t('pathsLead'),
    alternates: {
      canonical: `${SITE}/${locale}/parcours`,
      languages: hreflangFor('parcours'),
    },
  };
}

export default async function PathsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('toolbox');
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-12 sm:px-6 md:py-16">
      <p className="text-[13px] text-muted">
        <Link href="/boite-a-outils" className="hover:text-ink">
          {t('title')}
        </Link>{' '}
        / {t('pathsTitle')}
      </p>
      <h1 className="mt-4 font-display text-[clamp(30px,4vw,46px)] font-medium leading-[1.08] tracking-[-0.02em]">
        {t('pathsTitle')}
      </h1>
      <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-ink-soft">
        {t('pathsLead')}
      </p>
      <div className="mt-8">
        <PathList />
      </div>
    </div>
  );
}

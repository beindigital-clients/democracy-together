import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { KohopInfoPage } from '@/components/kohop/info-page';
import { alternatesFor } from '@/lib/seo';

// Reading material, FIRST DRAFT to be validated by the client (D-11).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'kohopPublic' });
  return {
    title: t('reviewerGuideTitle'),
    description: t('reviewerGuideLead'),
    alternates: alternatesFor(locale, 'kohop/guide-relecteur'),
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('kohopPublic');
  return (
    <KohopInfoPage
      title={t('reviewerGuideTitle')}
      lead={t('reviewerGuideLead')}
      items={[
        { title: t('rg1Title'), body: t('rg1Body') },
        { title: t('rg2Title'), body: t('rg2Body') },
        { title: t('rg3Title'), body: t('rg3Body') },
        { title: t('rg4Title'), body: t('rg4Body') },
        { title: t('rg5Title'), body: t('rg5Body') },
        { title: t('rg6Title'), body: t('rg6Body') },
      ]}
    />
  );
}

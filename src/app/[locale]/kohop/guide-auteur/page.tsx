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
    title: t('authorGuideTitle'),
    description: t('authorGuideLead'),
    alternates: alternatesFor(locale, 'kohop/guide-auteur'),
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
      title={t('authorGuideTitle')}
      lead={t('authorGuideLead')}
      items={[
        { title: t('ag1Title'), body: t('ag1Body') },
        { title: t('ag2Title'), body: t('ag2Body') },
        { title: t('ag3Title'), body: t('ag3Body') },
        { title: t('ag4Title'), body: t('ag4Body') },
        { title: t('ag5Title'), body: t('ag5Body') },
        { title: t('ag6Title'), body: t('ag6Body') },
      ]}
    />
  );
}

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
    title: t('charterTitle'),
    description: t('charterLead'),
    alternates: alternatesFor(locale, 'kohop/charte'),
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
      title={t('charterTitle')}
      lead={t('charterLead')}
      items={[
        { title: t('charter1Title'), body: t('charter1Body') },
        { title: t('charter2Title'), body: t('charter2Body') },
        { title: t('charter3Title'), body: t('charter3Body') },
        { title: t('charter4Title'), body: t('charter4Body') },
        { title: t('charter5Title'), body: t('charter5Body') },
        { title: t('charter6Title'), body: t('charter6Body') },
        { title: t('charter7Title'), body: t('charter7Body') },
      ]}
    />
  );
}

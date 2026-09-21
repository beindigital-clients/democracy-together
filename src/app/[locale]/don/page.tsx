import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ComingSoon } from '@/components/coming-soon';
import { alternatesFor } from '@/lib/seo';

// Cette page est LISTÉE DANS LE SITEMAP (src/app/sitemap.ts), qui déclare pour
// elle un jeu d'alternates fr/en/x-default. Sans `generateMetadata`, la page
// elle-même n'annonçait ni adresse canonique ni hreflang : le sitemap disait
// une chose, la page n'en disait aucune (audit F-04).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'footer' });
  const tSite = await getTranslations({ locale, namespace: 'site' });
  return {
    title: t('col3b'),
    description: tSite('description'),
    alternates: alternatesFor(locale, 'don'),
  };
}

export default async function DonPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('footer');
  return <ComingSoon title={t('col3b')} />;
}

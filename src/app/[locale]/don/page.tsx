import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ComingSoon } from '@/components/coming-soon';

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

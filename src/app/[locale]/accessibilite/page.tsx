import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getLegalContent } from '@/lib/legal-content';
import { LegalDocument } from '@/components/legal/legal-document';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const PATH = 'accessibilite';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const doc = getLegalContent('accessibilite', locale);
  return {
    title: doc.title,
    description: doc.intro,
    alternates: {
      canonical: `${SITE}/${locale}/${PATH}`,
      languages: {
        fr: `${SITE}/fr/${PATH}`,
        en: `${SITE}/en/${PATH}`,
        'x-default': `${SITE}/fr/${PATH}`,
      },
    },
  };
}

export default async function AccessibilitePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalDocument doc={getLegalContent('accessibilite', locale)} />;
}

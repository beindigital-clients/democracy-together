import type { Metadata } from 'next';
import { hreflangFor } from '@/lib/seo';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getLegalContent } from '@/lib/legal-content';
import {
  LegalDocument,
  type LegalSectionWithSlot,
} from '@/components/legal/legal-document';
import { AudienceOptOut } from '@/components/analytics/audience-opt-out';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const PATH = 'confidentialite';

// The "Cookies et traceurs" sections sit at the same position in all five
// languages (src/lib/legal-content.ts): the two processing operations of the
// outreach workstream — audience measurement and the newsletter's double
// opt-in — are described RIGHT AFTER, where a reader looking for "traceurs"
// will find them.
const AFTER_COOKIES = 7;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const doc = getLegalContent('confidentialite', locale);
  return {
    title: doc.title,
    description: doc.intro,
    alternates: {
      canonical: `${SITE}/${locale}/${PATH}`,
      languages: hreflangFor(PATH),
    },
  };
}

export default async function ConfidentialitePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const doc = getLegalContent('confidentialite', locale);
  const t = await getTranslations('privacy');

  const added: LegalSectionWithSlot[] = [
    {
      heading: t('audienceHeading'),
      body: [
        t('audienceP1'),
        t('audienceP2'),
        t('audienceP3'),
        t('audienceP4'),
      ],
      after: <AudienceOptOut />,
    },
    {
      heading: t('newsletterHeading'),
      body: [t('newsletterP1'), t('newsletterP2'), t('newsletterP3')],
    },
  ];
  const sections: LegalSectionWithSlot[] = [...doc.sections];
  sections.splice(Math.min(AFTER_COOKIES, sections.length), 0, ...added);

  return <LegalDocument doc={{ ...doc, sections }} />;
}

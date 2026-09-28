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

// Les sections « Cookies et traceurs » occupent le même rang dans les cinq
// langues (src/lib/legal-content.ts) : les deux traitements du chantier
// diffusion — mesure d'audience et double opt-in de la lettre — sont décrits
// JUSTE APRÈS, là où le lecteur qui cherche « traceurs » les trouvera.
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

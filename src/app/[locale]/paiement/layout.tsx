import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Transit pages of the payment flow (provider return, simulator, receipt
// link): specific to ONE request, never indexed.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'payments' });
  return {
    title: t('returnMetaTitle'),
    robots: { index: false, follow: false },
  };
}

export default function PaiementLayout({ children }: { children: ReactNode }) {
  return children;
}

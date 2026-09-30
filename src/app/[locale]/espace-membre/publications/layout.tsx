import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Page title of "Mes publications" (RGAA 8.6): the screen's name, completed
// by the member-area template. The page is a client component and cannot
// declare it itself.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'member' });
  return { title: t('publicationsTitle') };
}

export default function PublicationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}

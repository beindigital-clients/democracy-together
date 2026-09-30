import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Page title of this member screen (RGAA 8.6): its own name, completed by the
// member-area template (`espace-membre/layout.tsx`). The page is a client
// component and cannot declare it itself.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'peerReview' });
  return { title: t('authorTitle') };
}

export default function ManuscriptsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}

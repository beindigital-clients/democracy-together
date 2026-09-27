import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Page de confirmation du double opt-in : on y arrive par le lien du
// courriel, jamais par une recherche. Même arbitrage que la page de
// désinscription voisine (audit F-04, issue #35) : `noindex` mais crawlable,
// pas de canonical ni de hreflang. La page porte `'use client'` (elle lit un
// jeton dans l'URL) : ses métadonnées vivent donc ici.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'newsletter' });
  return {
    title: t('confirmTitle'),
    robots: { index: false, follow: true },
  };
}

export default function ConfirmationLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}

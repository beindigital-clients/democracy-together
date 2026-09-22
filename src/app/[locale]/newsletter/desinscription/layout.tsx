import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Page de désinscription : on y arrive par un lien d'e-mail, jamais par une
// recherche. Elle n'est ni dans le sitemap ni dans les zones interdites de
// `robots.txt` — elle n'était donc déclarée nulle part (audit F-04).
//
// La déclaration juste ici est `noindex`, PAS un canonical : c'est le même
// arbitrage que `/recherche` (issue #35). Sur une page qu'on ne veut pas voir
// indexée, le `noindex` EST la déclaration, et un hreflang n'y serait que du
// bruit qu'un moteur ignore. Contrairement aux pages d'authentification,
// celle-ci reste CRAWLABLE : sans cela un moteur ne lirait jamais le
// `noindex` qu'on vient de poser.
//
// La page elle-même porte `'use client'` (elle lit un jeton dans l'URL), donc
// ne peut pas exporter `generateMetadata` : d'où ce layout.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'newsletter' });
  return {
    title: t('unsubTitle'),
    robots: { index: false, follow: true },
  };
}

export default function UnsubscribeLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}

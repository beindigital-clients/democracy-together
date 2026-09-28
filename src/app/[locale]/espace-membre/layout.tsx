import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Page title for the member area (RGAA 8.6).
//
// Measured in the 27/09 RGAA audit: the tab, the history and a screen
// reader's first announcement said "Democracy Together" — the site's
// default title — on the member area as on any page that does not declare
// one. The page is `'use client'`, so it cannot export `generateMetadata`:
// hence this layout, modelled on `connexion/layout.tsx`.
// The sub-pages (submission, password) declare their own, more specific one.
//
// No `robots` here: `/espace-membre` is already disallowed for crawling by
// `robots.txt`, and the repo forbids combining the two measures
// (`tests/unit/seo-coherence.test.ts`).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return {
    title: t('memberTitle'),
  };
}

export default function EspaceMembreLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Confirmation page for the double opt-in: one arrives via the e-mail
// link, never via a search. Same decision as the neighbouring
// unsubscribe page (audit F-04, issue #35): `noindex` but crawlable,
// no canonical or hreflang. The page is `'use client'` (it reads a
// token from the URL): so its metadata lives here.
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

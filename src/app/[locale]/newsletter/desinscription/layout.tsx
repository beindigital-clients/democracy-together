import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Unsubscribe page: one arrives via an e-mail link, never via a search. It
// is neither in the sitemap nor in the disallowed zones of `robots.txt` — so
// it was declared nowhere (audit F-04).
//
// The right declaration here is `noindex`, NOT a canonical: same decision
// as `/recherche` (issue #35). On a page we do not want indexed, the
// `noindex` IS the declaration, and an hreflang would only be noise that a
// crawler ignores. Unlike the authentication pages, this one stays
// CRAWLABLE: otherwise a crawler would never read the `noindex` we just
// set.
//
// The page itself is `'use client'` (it reads a token from the URL), so it
// cannot export `generateMetadata`: hence this layout.
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

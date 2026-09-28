import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Metadata for sign-in by one-time code.
//
// These pages had NONE — not even a title: the browser tab and history
// showed "Democracy Together" for all three (audit F-04). The page is
// `'use client'`, so it cannot export `generateMetadata`: hence this
// layout.
//
// `noindex` rather than a canonical: this is a funnel page, it is not meant
// to be indexed, and the repo already decided that hreflang would be noise
// there (issue #35, the `/recherche` case).
//
// This is now the ONLY protection, and that is intentional (client decision
// of 23/09). `robots.txt` also disallowed crawling this page; the two
// measures cancelled each other out, since a crawler that honours the
// `Disallow` never comes to read this `noindex`. The `Disallow` is gone: the
// crawler comes by, reads the directive and applies it.
// `tests/unit/seo-coherence.test.ts` forbids relying on both at once.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return {
    title: t('otpTitle'),
    robots: { index: false, follow: true },
  };
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}

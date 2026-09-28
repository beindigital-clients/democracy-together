import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { alternatesFor } from '@/lib/seo';

// Why a layout rather than the page: `contact/page.tsx` is
// `'use client'` (form, local state, reCAPTCHA), and a client component
// CANNOT export `generateMetadata`. The missing canonical was therefore not
// an oversight but a consequence — and the sitemap did list the page with
// its alternates (audit F-04). A layout is Next's intended way to declare
// metadata above a client page; it renders nothing beyond its children.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contact' });
  return {
    title: t('metaTitle'),
    description: t('subtitle'),
    alternates: alternatesFor(locale, 'contact'),
  };
}

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { alternatesFor } from '@/lib/seo';

// Pourquoi un layout plutôt que la page : `contact/page.tsx` porte
// `'use client'` (formulaire, état local, reCAPTCHA), et un composant client
// NE PEUT PAS exporter `generateMetadata`. L'absence de canonical n'était donc
// pas un oubli mais une conséquence — et le sitemap, lui, listait bien la page
// avec ses alternates (audit F-04). Le layout est la façon prévue par Next de
// déclarer des métadonnées au-dessus d'une page client ; il ne rend rien de
// plus que ses enfants.
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

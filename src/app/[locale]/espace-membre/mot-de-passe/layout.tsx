import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Titre de page « Mon mot de passe » (RGAA 8.6) — voir
// `espace-membre/layout.tsx` pour le constat et la raison du layout.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return {
    title: `${t('passwordTitle')} · ${t('memberTitle')}`,
  };
}

export default function MotDePasseLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}

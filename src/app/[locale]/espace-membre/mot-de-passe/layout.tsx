import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Page title "Mon mot de passe" (RGAA 8.6) — see
// `espace-membre/layout.tsx` for the finding and the reason for the layout.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  // The screen's name only: the member-area template adds the area and the
  // site after it.
  return {
    title: t('passwordTitle'),
  };
}

export default function MotDePasseLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}

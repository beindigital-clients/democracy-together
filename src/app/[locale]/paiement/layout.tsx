import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Pages de passage du paiement (retour du prestataire, simulateur, lien de
// reçu) : propres à UNE demande, jamais indexées.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'payments' });
  return {
    title: t('returnMetaTitle'),
    robots: { index: false, follow: false },
  };
}

export default function PaiementLayout({ children }: { children: ReactNode }) {
  return children;
}

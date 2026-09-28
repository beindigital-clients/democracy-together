import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Titre de page du dépôt de publication (RGAA 8.6) — voir
// `espace-membre/layout.tsx` pour le constat et la raison du layout. Le titre
// nomme l'écran PUIS l'espace, comme le fil d'Ariane de la page.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'library' });
  return {
    title: `${t('submit.title')} · ${t('submit.memberSpace')}`,
  };
}

export default function DeposerLayout({ children }: { children: ReactNode }) {
  return children;
}

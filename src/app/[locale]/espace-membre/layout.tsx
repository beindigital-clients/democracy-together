import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Titre de page de l'espace membre (RGAA 8.6).
//
// Mesuré à l'audit RGAA du 27/09 : l'onglet, l'historique et la première
// annonce d'un lecteur d'écran disaient « Democracy Together » — le titre par
// défaut du site — sur l'espace membre comme sur n'importe quelle page qui
// n'en déclare pas. La page porte `'use client'`, donc ne peut pas exporter
// `generateMetadata` : d'où ce layout, sur le modèle de `connexion/layout.tsx`.
// Les sous-pages (dépôt, mot de passe) déclarent le leur, plus précis.
//
// Pas de `robots` ici : `/espace-membre` est déjà interdit au crawl par
// `robots.txt`, et le dépôt interdit de cumuler les deux mesures
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

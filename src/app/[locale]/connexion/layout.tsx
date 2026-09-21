import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Métadonnées de la page de connexion.
//
// Ces pages n'en avaient AUCUNE — pas même un titre : l'onglet du navigateur
// et l'historique affichaient « Democracy Together » pour les trois (audit
// F-04). La page porte `'use client'`, donc ne peut pas exporter
// `generateMetadata` : d'où ce layout.
//
// `noindex` plutôt qu'un canonical : c'est une page de tunnel, elle n'a pas
// vocation à entrer dans un index, et le dépôt a déjà tranché que le hreflang
// y serait du bruit (issue #35, cas `/recherche`). `robots.txt` l'interdit
// DÉJÀ au crawl — la déclaration posée ici est donc une seconde ceinture, qui
// vaudra le jour où cette liste changera. Elle ne remplace pas l'autre : un
// moteur qui respecte le `Disallow` ne vient pas lire ce `noindex`.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return {
    title: t('signInTitle'),
    robots: { index: false, follow: true },
  };
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}

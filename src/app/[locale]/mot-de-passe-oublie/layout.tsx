import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

// Métadonnées de la réinitialisation de mot de passe.
//
// Ces pages n'en avaient AUCUNE — pas même un titre : l'onglet du navigateur
// et l'historique affichaient « Democracy Together » pour les trois (audit
// F-04). La page porte `'use client'`, donc ne peut pas exporter
// `generateMetadata` : d'où ce layout.
//
// `noindex` plutôt qu'un canonical : c'est une page de tunnel, elle n'a pas
// vocation à entrer dans un index, et le dépôt a déjà tranché que le hreflang
// y serait du bruit (issue #35, cas `/recherche`).
//
// C'est désormais la SEULE protection, et c'est voulu (arbitrage client du
// 23/09). `robots.txt` interdisait aussi le crawl de cette page ; les deux
// mesures se neutralisaient, puisqu'un moteur qui respecte le `Disallow` ne
// vient jamais lire ce `noindex`. Le `Disallow` est parti : le moteur passe,
// lit la consigne et l'applique. `tests/unit/seo-coherence.test.ts` interdit
// de reposer l'un sur l'autre.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return {
    title: t('forgotTitle'),
    robots: { index: false, follow: true },
  };
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}

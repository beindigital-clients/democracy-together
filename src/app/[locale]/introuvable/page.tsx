import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import LocaleNotFound from '../not-found';

// Page « introuvable » (R-04) — cible de la RÉÉCRITURE du middleware pour
// tout premier segment inconnu sous un préfixe de langue (`/ar/xyz`,
// `/fr/nimporte-quoi`) et pour un slug vide (`/fr/le-reseau/%00`), cf.
// src/lib/not-found-routes.ts.
//
// Pourquoi une PAGE et pas `notFound()` : sur Next 16.3.5, un `notFound()`
// levé depuis une route qui matche rend un corps vide sans JavaScript
// (mesuré, cf. src/app/not-found.tsx). Une page ordinaire, elle, est rendue
// dans le HTML servi, dans le layout de langue — en-tête, pied de page,
// `lang` et `dir` du visiteur. Le statut 404 est posé par le middleware sur
// la réécriture ; cette page ne le connaît pas et ne l'invente pas.
//
// Elle réutilise tel quel le composant de la 404 localisée (`not-found.tsx`)
// : un seul texte, une seule mise en page pour les deux chemins qui mènent à
// « cette adresse n'existe pas ».
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'errors' });
  return {
    title: t('notFoundTitle'),
    // Jamais indexée : c'est une réponse, pas un contenu.
    robots: { index: false, follow: true },
  };
}

export default async function NotFoundPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LocaleNotFound />;
}

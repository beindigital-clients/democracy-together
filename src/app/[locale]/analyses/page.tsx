import { redirect } from '@/i18n/navigation';

// « Analyses » est l'entrée de nav historique vers la bibliothèque (F-32).
// On redirige l'ancienne URL pour préserver les liens existants.
export default async function AnalysesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: '/bibliotheque', locale });
}

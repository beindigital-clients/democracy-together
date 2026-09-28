import { redirect } from '@/i18n/navigation';

// "Analyses" is the historical nav entry to the library (F-32).
// We redirect the old URL to preserve existing links.
export default async function AnalysesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: '/bibliotheque', locale });
}

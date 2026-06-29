import { redirect } from 'next/navigation';

// Inscription directe DÉSACTIVÉE : plus d'auto-création de compte. Tout accès à
// cette page est redirigé vers la demande d'adhésion — un compte membre n'est
// créé qu'après validation de la candidature (modèle d'adhésion validée).
export default async function InscriptionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/adhesion`);
}

import { redirect } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';

// Inscription directe DÉSACTIVÉE : plus d'auto-création de compte. Tout accès à
// cette page est redirigé vers la demande d'adhésion — un compte membre n'est
// créé qu'après validation de la candidature (modèle d'adhésion validée).
export default async function InscriptionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: '/adhesion', locale: resolveLocale(locale) });
}

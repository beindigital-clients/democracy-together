import { redirect } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';

// `/paiement` n'a pas de contenu propre (ses sous-pages sont des étapes d'une
// demande) : on renvoie vers la page de don plutôt que vers une 404.
export default async function PaiementIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: '/don', locale: resolveLocale(locale) });
}

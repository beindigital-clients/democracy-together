import { redirect } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';

// `/paiement` has no content of its own (its sub-pages are steps of a
// request): we redirect to the donation page rather than to a 404.
export default async function PaiementIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: '/don', locale: resolveLocale(locale) });
}

import { redirect } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';

// Direct sign-up DISABLED: no more self-service account creation. Any access
// to this page is redirected to the membership application — a member
// account is only created once the application is approved (approved
// membership model).
export default async function InscriptionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: '/adhesion', locale: resolveLocale(locale) });
}

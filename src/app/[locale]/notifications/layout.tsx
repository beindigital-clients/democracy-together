import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MemberArea } from '@/components/member/member-area';

// The notifications live at their own address (the bell links there), but
// they are the reader's own: they render inside the member area's frame,
// its navigation beside them — following "Voir toutes les notifications"
// no longer drops it.
//
// `/notifications` is a protected zone (src/lib/protected-routes.ts): only a
// signed-in reader gets here, hence the shell without a condition.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'notifications' });
  // The root layout's template adds the site's name.
  return { title: t('title') };
}

export default async function NotificationsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MemberArea locale={locale}>{children}</MemberArea>;
}

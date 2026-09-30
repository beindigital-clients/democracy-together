import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MemberArea } from '@/components/member/member-area';

// The workspaces keep their address (`/espaces/<id>` is stored in
// invitation notifications and shared between members), but they are one of
// the member area's screens: they render inside its frame, its navigation
// beside them. Following "Espaces de travail" from that navigation used to
// drop it.
//
// `/espaces` is a protected zone (src/lib/protected-routes.ts): only a
// signed-in reader gets here, hence the shell without a condition.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workspaces' });
  // The root layout's template adds the site's name.
  return { title: t('title') };
}

export default async function EspacesLayout({
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

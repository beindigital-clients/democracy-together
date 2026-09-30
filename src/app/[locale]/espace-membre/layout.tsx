import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  getMessages,
  getTimeZone,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import { SITE_NAME } from '@/lib/seo';
import { MemberShell } from '@/components/member/member-shell';
import { IntlClientProvider } from '@/components/providers/intl-client-provider';
import {
  BASE_CLIENT_NAMESPACES,
  MEMBER_NAMESPACES,
  pickNamespaces,
} from '@/i18n/client-namespaces';

// Page title for the member area (RGAA 8.6).
//
// Measured in the 27/09 RGAA audit: the tab, the history and a screen
// reader's first announcement said "Democracy Together" — the site's
// default title — on the member area as on any page that does not declare
// one. The page is `'use client'`, so it cannot export `generateMetadata`:
// hence this layout, modelled on `connexion/layout.tsx`.
// The sub-pages (submission, password) declare their own, more specific one.
//
// No `robots` here: `/espace-membre` is already disallowed for crawling by
// `robots.txt`, and the repo forbids combining the two measures
// (`tests/unit/seo-coherence.test.ts`).
//
// A TEMPLATE, not a plain string: a plain title here cut the root template
// off for every sub-page, whose tab then read "Mon profil" alone — no area,
// no site. Now "Mon profil · Espace membre · Democracy Together"; the home of
// the area keeps "Espace membre · Democracy Together".
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return {
    title: {
      default: t('memberTitle'),
      template: `%s · ${t('memberTitle')} · ${SITE_NAME}`,
    },
  };
}

// Every member screen renders inside the shared shell (side navigation,
// identity, mobile menu). The layout persists across navigations between
// member screens: the column is not re-read nor redrawn from one to the next.
//
// The shell's labels (`member` namespace) are added to the browser catalogue
// HERE, for the member area only — the same arrangement as the back office
// (`admin/layout.tsx`): a nested provider REPLACES its descendants'
// catalogue, so it carries the base plus `member`.
export default async function EspaceMembreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = pickNamespaces(await getMessages(), [
    ...BASE_CLIENT_NAMESPACES,
    ...MEMBER_NAMESPACES,
  ]);
  const timeZone = await getTimeZone();

  return (
    <IntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
      <MemberShell>{children}</MemberShell>
    </IntlClientProvider>
  );
}

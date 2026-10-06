import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getMessages, getTimeZone, getTranslations } from 'next-intl/server';
import { IntlClientProvider } from '@/components/providers/intl-client-provider';
import {
  BASE_CLIENT_NAMESPACES,
  KOHOP_NAMESPACES,
  MEMBER_NAMESPACES,
  pickNamespaces,
} from '@/i18n/client-namespaces';

// Page title of this member screen (RGAA 8.6): the page is a client component
// and cannot declare it itself. The member area is kept out of search engines
// by robots.txt, which is why no `noindex` is declared here.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'kohop' });
  return { title: t('authorTitle') };
}

// The KOHOP catalogue is carried by these screens only. A nested provider
// REPLACES its descendants' catalogue, so it repeats its frame's namespaces.
export default async function KohopAuthorLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = pickNamespaces(await getMessages(), [
    ...BASE_CLIENT_NAMESPACES,
    ...MEMBER_NAMESPACES,
    ...KOHOP_NAMESPACES,
  ]);
  return (
    <IntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={await getTimeZone()}
    >
      {children}
    </IntlClientProvider>
  );
}

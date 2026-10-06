import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getMessages, getTimeZone, getTranslations } from 'next-intl/server';
import { IntlClientProvider } from '@/components/providers/intl-client-provider';
import {
  BASE_CLIENT_NAMESPACES,
  KOHOP_NAMESPACES,
  pickNamespaces,
} from '@/i18n/client-namespaces';

// The page of a personal one-time link: never indexed, and the token in the
// address is not passed on to other sites (`referrer: no-referrer`).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'kohop' });
  return {
    title: t('invTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function KohopInvitationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = pickNamespaces(await getMessages(), [
    ...BASE_CLIENT_NAMESPACES,
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

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

// Page title of "Mes textes" (RGAA 8.6): the page is a client component and
// cannot declare it itself.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'member' });
  return { title: t('myTextsTitle') };
}

// The screen names the KOHOP stages, whose labels live in the KOHOP
// catalogue: it is carried here, like on the KOHOP screens. A nested provider
// REPLACES its descendants' catalogue, so it repeats its frame's namespaces.
export default async function MyTextsLayout({
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

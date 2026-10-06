import type { ReactNode } from 'react';
import { getMessages, getTimeZone } from 'next-intl/server';
import { IntlClientProvider } from '@/components/providers/intl-client-provider';
import {
  ADMIN_NAMESPACES,
  BASE_CLIENT_NAMESPACES,
  KOHOP_NAMESPACES,
  pickNamespaces,
} from '@/i18n/client-namespaces';

// The KOHOP catalogue is carried by the KOHOP screens only (see
// `KOHOP_NAMESPACES`). A nested provider REPLACES its descendants' catalogue,
// so it repeats the back office's own namespaces.
export default async function AdminKohopLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = pickNamespaces(await getMessages(), [
    ...BASE_CLIENT_NAMESPACES,
    ...ADMIN_NAMESPACES,
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

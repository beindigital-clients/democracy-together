import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  getMessages,
  getTimeZone,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import { AdminShell } from '@/components/admin/admin-shell';
import { IntlClientProvider } from '@/components/providers/intl-client-provider';
import {
  BASE_CLIENT_NAMESPACES,
  ADMIN_NAMESPACES,
  pickNamespaces,
} from '@/i18n/client-namespaces';

// The root layout only sends the browser the message namespaces
// useful to public pages (F-05): `admin` weighs 10 KB and has no place
// in the home page HTML. The back office adds it here, for itself only.
//
// A nested provider REPLACES its descendants' catalog, it does not
// supplement it: the list set here is therefore the base PLUS `admin`. The cost is
// that admin pages carry the base twice — once through the
// root layout, once here. This is accepted: these screens are behind
// authentication, disallowed for crawling, and off the low-bandwidth path that F-05
// measures.
// Title served in the HTML (RGAA 8.6): "Administration" rather than the site's
// default title. The specific screen is added client-side by `AdminShell`,
// since the screens are client components without `generateMetadata`. No
// `robots`: `/admin` is disallowed for crawling by `robots.txt`, and the repo
// forbids combining the two (`tests/unit/seo-coherence.test.ts`).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('title') };
}

export default async function AdminLayout({
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
    ...ADMIN_NAMESPACES,
  ]);
  const timeZone = await getTimeZone();

  return (
    <IntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
      <AdminShell>{children}</AdminShell>
    </IntlClientProvider>
  );
}

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

// Le layout racine ne transmet au navigateur que les espaces de messages
// utiles aux pages publiques (F-05) : `admin` pèse 10 Ko et n'a rien à faire
// dans le HTML de l'accueil. Le back-office le rajoute ici, pour lui seul.
//
// Un fournisseur imbriqué REMPLACE le catalogue de ses descendants, il ne le
// complète pas : la liste posée ici est donc la base PLUS `admin`. Le coût est
// que les pages d'administration portent la base deux fois — une fois par le
// layout racine, une fois ici. C'est assumé : ces écrans sont derrière
// authentification, interdits au crawl, et hors du chemin bas débit que F-05
// mesure.
// Titre servi dans le HTML (RGAA 8.6) : « Administration » plutôt que le titre
// par défaut du site. L'écran précis est ajouté côté client par `AdminShell`,
// les écrans étant des composants client sans `generateMetadata`. Pas de
// `robots` : `/admin` est interdit au crawl par `robots.txt`, et le dépôt
// interdit de cumuler les deux (`tests/unit/seo-coherence.test.ts`).
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

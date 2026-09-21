import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import {
  getMessages,
  getTimeZone,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { isSupportedLocale, resolveLocale } from '@/i18n/locale';
import { newsreader, plexSans, plexMono } from '@/lib/fonts';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { IntlClientProvider } from '@/components/providers/intl-client-provider';
import { ConvexClientProvider } from '@/components/providers/convex-client-provider';
import { MotionProvider } from '@/components/motion/motion-provider';
import { CookieConsent } from '@/components/legal/cookie-consent';
import { ConvexAuthNextjsServerProvider } from '@convex-dev/auth/nextjs/server';
import '../globals.css';

// Métadonnées par DÉFAUT du site : elles sont servies telles quelles sur toute
// page dépourvue de `generateMetadata` propre. Statiques, elles décrivaient le
// site en français jusque sur `/en` — donc dans les résultats de recherche
// anglais (issue #34). `generateMetadata` les rend dépendantes de la langue.
// La locale est passée explicitement à `getTranslations` : cette fonction
// s'exécute hors du rendu, avant tout `setRequestLocale`.
// Le titre, lui, est un NOM PROPRE : il ne se traduit pas.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: 'site',
  });
  return {
    title: {
      default: 'Democracy Together',
      template: '%s · Democracy Together',
    },
    description: t('description'),
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Applique le thème avant peinture (anti-flash). Le thème est une préférence
// visuelle sans enjeu SEO -> localStorage est légitime ici.
const themeInit = `(function(){try{var t=localStorage.getItem('dt-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

// Filet pour les navigateurs sans JavaScript (F-05, faible débit) : les
// primitives d'animation posent `opacity:0` en style inline côté serveur. Sans
// script pour les animer, le contenu reste invisible — mesuré avant correctif :
// page des mentions légales entièrement blanche. Cette règle ne s'applique
// QU'EN l'absence de JavaScript, donc les animations restent intactes ailleurs.
const noScriptReveal = `[data-reveal]{opacity:1 !important;transform:none !important}`;

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  // `NextIntlClientProvider` rendu directement depuis un composant serveur
  // hérite seul de la locale et du fuseau. Le passage par `IntlClientProvider`
  // — nécessaire pour lui poser `getMessageFallback` et `onError`, qui sont des
  // fonctions — coupe cet héritage : on les transmet donc explicitement.
  const timeZone = await getTimeZone();

  return (
    <ConvexAuthNextjsServerProvider>
      <html
        lang={locale}
        data-universe="institutionnel"
        suppressHydrationWarning
        className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeInit }} />
          <noscript>
            <style dangerouslySetInnerHTML={{ __html: noScriptReveal }} />
          </noscript>
        </head>
        <body className="flex min-h-dvh flex-col">
          <IntlClientProvider
            locale={locale}
            messages={messages}
            timeZone={timeZone}
          >
            <ConvexClientProvider>
              <MotionProvider>
                <SiteHeader />
                <main className="flex-1">{children}</main>
                <SiteFooter />
                <CookieConsent />
              </MotionProvider>
            </ConvexClientProvider>
          </IntlClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}

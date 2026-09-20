import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { isSupportedLocale } from '@/i18n/locale';
import { newsreader, plexSans, plexMono } from '@/lib/fonts';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { ConvexClientProvider } from '@/components/providers/convex-client-provider';
import { MotionProvider } from '@/components/motion/motion-provider';
import { CookieConsent } from '@/components/legal/cookie-consent';
import { ConvexAuthNextjsServerProvider } from '@convex-dev/auth/nextjs/server';
import '../globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Democracy Together',
    template: '%s · Democracy Together',
  },
  description:
    'Réseau international de think tanks pour la démocratie · Afrique–Europe.',
};

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
          <NextIntlClientProvider messages={messages}>
            <ConvexClientProvider>
              <MotionProvider>
                <SiteHeader />
                <main className="flex-1">{children}</main>
                <SiteFooter />
                <CookieConsent />
              </MotionProvider>
            </ConvexClientProvider>
          </NextIntlClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}

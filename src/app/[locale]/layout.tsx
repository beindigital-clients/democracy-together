import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { newsreader, plexSans, plexMono } from '@/lib/fonts';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { ConvexClientProvider } from '@/components/providers/convex-client-provider';
import { RecaptchaProvider } from '@/components/providers/recaptcha-provider';
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

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
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
      </head>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider messages={messages}>
          <ConvexClientProvider>
            <RecaptchaProvider>
              <MotionProvider>
                <SiteHeader />
                <main className="flex-1">{children}</main>
                <SiteFooter />
                <CookieConsent />
              </MotionProvider>
            </RecaptchaProvider>
          </ConvexClientProvider>
        </NextIntlClientProvider>
      </body>
    </html>
    </ConvexAuthNextjsServerProvider>
  );
}

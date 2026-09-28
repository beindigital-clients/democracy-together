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
import { direction } from '@/i18n/direction';
import { fontVariables } from '@/lib/fonts';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { IntlClientProvider } from '@/components/providers/intl-client-provider';
import { ConvexClientProvider } from '@/components/providers/convex-client-provider';
import { MotionProvider } from '@/components/motion/motion-provider';
import { CookieConsent } from '@/components/legal/cookie-consent';
import { AudienceBeacon } from '@/components/analytics/audience-beacon';
import {
  SITE_NAME,
  SITE_URL,
  openGraphLocale,
  alternateOpenGraphLocales,
  organizationJsonLd,
  jsonLdScript,
} from '@/lib/seo';
import {
  BASE_CLIENT_NAMESPACES,
  pickNamespaces,
} from '@/i18n/client-namespaces';
import { ConvexAuthNextjsServerProvider } from '@convex-dev/auth/nextjs/server';
import '../globals.css';

// Site DEFAULT metadata: served as is on any page without its own
// `generateMetadata`. When static, they described the site in French even on
// `/en` — hence in English search results (issue #34). `generateMetadata`
// makes them language-dependent.
// The locale is passed explicitly to `getTranslations`: this function
// runs outside rendering, before any `setRequestLocale`.
// The title, however, is a PROPER NOUN: it is not translated.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const loc = resolveLocale(locale);
  const t = await getTranslations({ locale: loc, namespace: 'site' });
  return {
    // Without `metadataBase`, a share image declared as a relative path is
    // not resolved to an absolute URL — and a relative URL is readable by
    // no social network.
    metadataBase: new URL(SITE_URL),
    title: {
      default: SITE_NAME,
      template: `%s · ${SITE_NAME}`,
    },
    description: t('description'),
    // Open Graph and Twitter Card set HERE rather than page by page: Next
    // metadata propagates from the layout to the pages, so all 48 pages
    // inherit it at once — including those without their own
    // `generateMetadata` (F-03).
    //
    // `title`, `description` and `url` are DELIBERATELY absent from this block.
    // Measured: setting them here FREEZES them for the whole site — og:title was
    // "Democracy Together" even on /fr/adhesion, and og:url pointed to the
    // home page from every page, which an aggregator may take for the
    // canonical URL and which would collapse all shares onto a single
    // page. Left empty, Next derives them from each page's RESOLVED title and
    // description: /fr/adhesion announces "Rejoindre le réseau ·
    // Democracy Together" and its own description.
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: openGraphLocale(loc),
      alternateLocale: alternateOpenGraphLocales(loc),
    },
    twitter: {
      card: 'summary_large_image',
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Applies the theme before paint (anti-flash). The theme is a visual
// preference with no SEO stakes -> localStorage is legitimate here.
// Without a SAVED preference, the system's decides
// (`prefers-color-scheme`): measured on 27/09, a browser set to dark
// arrived in light mode until it had touched the toggle.
const themeInit = `(function(){try{var t=localStorage.getItem('dt-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

// Safety net for browsers without JavaScript (F-05, low bandwidth): the
// animation primitives set `opacity:0` as an inline style server-side. With no
// script to animate them, the content stays invisible — measured before the
// fix: the legal notice page entirely blank. This rule applies ONLY in the
// absence of JavaScript, so animations remain intact elsewhere.
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
  // Only the namespaces that CLIENT components ask for cross the RSC
  // boundary (F-05): the rest is read server-side by `getTranslations`
  // and has no business in the HTML. The back office sets its own in its
  // own layout.
  const messages = pickNamespaces(await getMessages(), BASE_CLIENT_NAMESPACES);
  // `NextIntlClientProvider` rendered directly from a server component
  // inherits the locale and time zone on its own. Going through
  // `IntlClientProvider` — needed to give it `getMessageFallback` and
  // `onError`, which are functions — breaks that inheritance: so we pass them
  // explicitly.
  const timeZone = await getTimeZone();
  const tSite = await getTranslations({
    locale: resolveLocale(locale),
    namespace: 'site',
  });
  const orgJsonLd = organizationJsonLd(tSite('description'));

  return (
    <ConvexAuthNextjsServerProvider>
      <html
        lang={locale}
        // WRITING DIRECTION SERVED IN THE HTML, not set in JavaScript after
        // the fact. `dir` governs the browser's bidirectional algorithm and
        // the resolution of ALL the stylesheet's logical properties: setting
        // it client-side would paint the whole page backwards before
        // hydration, then flip it. Same reasoning as the middleware's
        // server-side gating — a boundary crossed in the served document,
        // not in an effect.
        dir={direction(locale)}
        data-universe="institutionnel"
        suppressHydrationWarning
        className={fontVariables(locale)}
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeInit }} />
          <noscript>
            <style dangerouslySetInnerHTML={{ __html: noScriptReveal }} />
          </noscript>
          {/* Structured data (F-03). Placed in the SERVED HTML, hence
              readable by a crawler that does not run JavaScript. */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLdScript(orgJsonLd) }}
          />
        </head>
        <body className="flex min-h-dvh flex-col">
          <IntlClientProvider
            locale={locale}
            messages={messages}
            timeZone={timeZone}
          >
            <ConvexClientProvider>
              <MotionProvider>
                {/* Skip link (RGAA 12.7): twelve tab presses separated the
                    first focus from the content (measured on 27/09). Invisible
                    until keyboard focus, first focusable element of the
                    page. */}
                <a
                  href="#contenu"
                  className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-sm focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-contrast focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent"
                >
                  {tSite('skipToContent')}
                </a>
                <SiteHeader />
                <main id="contenu" className="flex-1">
                  {children}
                </main>
                <SiteFooter />
                <CookieConsent />
                {/* First-party, cookieless audience measurement (F-66). */}
                <AudienceBeacon />
              </MotionProvider>
            </ConvexClientProvider>
          </IntlClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}

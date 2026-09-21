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
import {
  SITE_NAME,
  SITE_URL,
  openGraphLocale,
  alternateOpenGraphLocales,
  organizationJsonLd,
} from '@/lib/seo';
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
  const loc = resolveLocale(locale);
  const t = await getTranslations({ locale: loc, namespace: 'site' });
  return {
    // Sans `metadataBase`, une image de partage déclarée en chemin relatif
    // n'est pas résolue en URL absolue — et une URL relative n'est lisible par
    // aucun réseau social.
    metadataBase: new URL(SITE_URL),
    title: {
      default: SITE_NAME,
      template: `%s · ${SITE_NAME}`,
    },
    description: t('description'),
    // Open Graph et Twitter Card posés ICI plutôt que page par page : les
    // métadonnées Next se propagent du layout vers les pages, donc les 48
    // pages en héritent d'un coup — y compris celles qui n'ont pas de
    // `generateMetadata` propre (F-03).
    //
    // `title`, `description` et `url` sont VOLONTAIREMENT absents de ce bloc.
    // Mesuré : les y poser les FIGE pour tout le site — og:title valait
    // « Democracy Together » jusque sur /fr/adhesion, et og:url pointait
    // l'accueil depuis chaque page, ce qu'un agrégateur peut prendre pour
    // l'adresse canonique et qui replierait tous les partages sur une seule
    // page. Laissés vides, Next les dérive du titre et de la description
    // RÉSOLUS de chaque page : /fr/adhesion annonce « Rejoindre le réseau ·
    // Democracy Together » et sa propre description.
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
  const tSite = await getTranslations({
    locale: resolveLocale(locale),
    namespace: 'site',
  });
  const orgJsonLd = organizationJsonLd(tSite('description'));

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
          {/* Données structurées (F-03). Posées dans le HTML SERVI, donc
              lisibles par un robot qui n'exécute pas JavaScript. */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
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

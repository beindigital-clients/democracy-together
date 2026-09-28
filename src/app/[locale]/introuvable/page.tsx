import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import LocaleNotFound from '../not-found';

// "Not found" page (R-04) — target of the middleware REWRITE for any
// unknown first segment under a language prefix (`/ar/xyz`,
// `/fr/nimporte-quoi`) and for an empty slug (`/fr/le-reseau/%00`), see
// src/lib/not-found-routes.ts.
//
// Why a PAGE and not `notFound()`: on Next 16.3.5, a `notFound()` thrown
// from a matching route renders an empty body without JavaScript
// (measured, see src/app/not-found.tsx). An ordinary page, on the other hand,
// is rendered in the served HTML, inside the language layout — header,
// footer, the visitor's `lang` and `dir`. The 404 status is set by the
// middleware on the rewrite; this page does not know it and does not make it
// up.
//
// It reuses the localized 404 component (`not-found.tsx`) as is: a single
// text, a single layout for both paths that lead to "this address does not
// exist".
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'errors' });
  return {
    title: t('notFoundTitle'),
    // Never indexed: it is a response, not content.
    robots: { index: false, follow: true },
  };
}

export default async function NotFoundPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LocaleNotFound />;
}

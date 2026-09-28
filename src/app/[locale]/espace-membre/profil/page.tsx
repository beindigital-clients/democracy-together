import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PROFILE_THEMES } from '@convex/lib/social';
import { Link } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import { AuthGate } from '@/components/auth/auth-gate';
import { ArrowBack } from '@/components/ui/arrow';
import { ProfileEditor } from '@/components/social/profile-editor';

// "Mon profil" ("social" workstream). A SERVER page around a client
// editor: the theme labels live in the `directory` namespace, which the
// browser does not receive (src/i18n/client-namespaces.ts) — so they are
// resolved here and passed as props, rather than sending the whole
// directory with every page of the site.
//
// No `noindex`: the `espace-membre` area is already disallowed for crawling
// by robots.txt, and the repo forbids combining the two (seo-coherence).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'profile' });
  return { title: t('title') };
}

export default async function ProfilPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('profile');
  const td = await getTranslations('directory');
  const themeLabels = Object.fromEntries(
    PROFILE_THEMES.map((slug) => [slug, vocabulary(td, 'themes.', slug)]),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link
        href="/espace-membre"
        className="inline-flex min-h-11 items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-muted hover:text-ink"
      >
        <ArrowBack /> {t('back')}
      </Link>
      <h1 className="mt-2 font-display text-3xl">{t('title')}</h1>
      <p className="mt-2 max-w-[60ch] text-ink-soft">{t('intro')}</p>
      <div className="mt-8">
        <AuthGate className="max-w-md">
          <ProfileEditor themeLabels={themeLabels} />
        </AuthGate>
      </div>
    </div>
  );
}

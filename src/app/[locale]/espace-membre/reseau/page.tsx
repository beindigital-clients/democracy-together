import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PROFILE_THEMES } from '@convex/lib/social';
import { Link } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import { AuthGate } from '@/components/auth/auth-gate';
import { ArrowBack } from '@/components/ui/arrow';
import { NetworkView } from '@/components/social/network-view';

// « Mon réseau » (chantier « social ») : activité des personnes suivies,
// abonnements, abonnés, organisations suivies.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'people' });
  return { title: t('network.title') };
}

export default async function ReseauPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('people');
  const tp = await getTranslations('profile');
  const td = await getTranslations('directory');
  const themeLabels = Object.fromEntries(
    PROFILE_THEMES.map((slug) => [slug, vocabulary(td, 'themes.', slug)]),
  );
  return (
    <div className="mx-auto max-w-[960px] px-4 py-12 sm:px-6">
      <Link
        href="/espace-membre"
        className="inline-flex min-h-11 items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-muted hover:text-ink"
      >
        <ArrowBack /> {tp('back')}
      </Link>
      <h1 className="mt-2 font-display text-3xl">{t('network.title')}</h1>
      <div className="mt-8">
        <AuthGate className="max-w-md">
          <NetworkView themeLabels={themeLabels} />
        </AuthGate>
      </div>
    </div>
  );
}

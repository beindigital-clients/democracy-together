import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PROFILE_THEMES } from '@convex/lib/social';
import { vocabulary } from '@/i18n/vocabulary';
import { AuthGate } from '@/components/auth/auth-gate';
import {
  MemberPageBody,
  MemberPageHeader,
} from '@/components/member/page-header';
import { NetworkView } from '@/components/social/network-view';

// "Mon réseau" ("social" workstream): activity of followed people,
// following, followers, followed organizations.
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
  const td = await getTranslations('directory');
  const themeLabels = Object.fromEntries(
    PROFILE_THEMES.map((slug) => [slug, vocabulary(td, 'themes.', slug)]),
  );
  return (
    <>
      <MemberPageHeader title={t('network.title')} lead={t('network.lead')} />
      <MemberPageBody>
        <AuthGate>
          <NetworkView themeLabels={themeLabels} />
        </AuthGate>
      </MemberPageBody>
    </>
  );
}

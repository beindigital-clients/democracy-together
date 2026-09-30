import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PROFILE_THEMES } from '@convex/lib/social';
import { vocabulary } from '@/i18n/vocabulary';
import { AuthGate } from '@/components/auth/auth-gate';
import {
  MemberPageBody,
  MemberPageHeader,
} from '@/components/member/page-header';
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
    <>
      <MemberPageHeader title={t('title')} lead={t('intro')} />
      <MemberPageBody>
        <AuthGate>
          <ProfileEditor themeLabels={themeLabels} />
        </AuthGate>
      </MemberPageBody>
    </>
  );
}

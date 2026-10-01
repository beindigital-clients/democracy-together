import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAuthenticatedNextjs } from '@convex-dev/auth/nextjs/server';
import { PROFILE_THEMES } from '@convex/lib/social';
import { vocabulary } from '@/i18n/vocabulary';
import { AuthGate } from '@/components/auth/auth-gate';
import { PeopleDirectory } from '@/components/social/people-directory';
import { MemberArea } from '@/components/member/member-area';
import {
  MemberPageBody,
  MemberPageHeader,
} from '@/components/member/page-header';

// Directory of PEOPLE ("social" workstream) — reserved for network
// members. The `membres` segment is NOT a protected zone of the middleware
// (src/lib/protected-routes.ts): public profiles `/membres/<handle>`
// must remain readable without an account. This page is therefore guarded
// by `AuthGate` on the client, and above all by Convex, which returns
// nothing to an anonymous user or a visitor.
//
// `noindex`: without a session, there is nothing to index here. No hreflang
// for the same reason (issue #35).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'people' });
  return {
    title: t('title'),
    description: t('metaDescription'),
    robots: { index: false, follow: true },
  };
}

export default async function MembresPage({
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

  // SIGNED IN: one of the member area's screens, inside its frame — the
  // directory is an entry of its navigation, and following it used to drop
  // that navigation. The server reads the session, as the header does: the
  // served HTML already has the right frame, nothing moves on hydration.
  if (await isAuthenticatedNextjs()) {
    return (
      <MemberArea locale={locale}>
        <MemberPageHeader title={t('title')} lead={t('intro')} />
        <MemberPageBody>
          <AuthGate>
            <PeopleDirectory themeLabels={themeLabels} />
          </AuthGate>
        </MemberPageBody>
      </MemberArea>
    );
  }

  // Not signed in: the public address, and its invitation to sign in.
  return (
    <MemberArea locale={locale} shell={false}>
      <div className="mx-auto max-w-[1100px] px-4 py-12 sm:px-6 md:py-16">
        <h1 className="font-display text-[clamp(30px,4.5vw,44px)] leading-tight">
          {t('title')}
        </h1>
        <p className="mt-3 max-w-[62ch] text-ink-soft">{t('intro')}</p>
        <div className="mt-8">
          <AuthGate className="max-w-md">
            <PeopleDirectory themeLabels={themeLabels} />
          </AuthGate>
        </div>
      </div>
    </MemberArea>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthGate } from '@/components/auth/auth-gate';
import {
  MemberPageBody,
  MemberPageHeader,
} from '@/components/member/page-header';
import { MessagesApp } from '@/components/social/messages-app';

// Private messaging ("social" workstream). The screen is entirely
// client-side (real time); `Suspense` because it reads the URL (`?c=`,
// `?to=`) via `useSearchParams`.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'messages' });
  return { title: t('title') };
}

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('messages');
  return (
    <>
      <MemberPageHeader title={t('title')} lead={t('lead')} />
      <MemberPageBody>
        <AuthGate>
          <Suspense fallback={<p className="text-ink-soft">{t('loading')}</p>}>
            <MessagesApp />
          </Suspense>
        </AuthGate>
      </MemberPageBody>
    </>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { AuthGate } from '@/components/auth/auth-gate';
import { ArrowBack } from '@/components/ui/arrow';
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
  const tp = await getTranslations('profile');
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-12 sm:px-6">
      <Link
        href="/espace-membre"
        className="inline-flex min-h-11 items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-muted hover:text-ink"
      >
        <ArrowBack /> {tp('back')}
      </Link>
      <h1 className="mt-2 font-display text-3xl">{t('title')}</h1>
      <div className="mt-8">
        <AuthGate className="max-w-md">
          <Suspense fallback={<p className="text-ink-soft">{t('loading')}</p>}>
            <MessagesApp />
          </Suspense>
        </AuthGate>
      </div>
    </div>
  );
}

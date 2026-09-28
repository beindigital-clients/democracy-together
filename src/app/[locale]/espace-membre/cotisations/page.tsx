'use client';

import { useTranslations } from 'next-intl';
import { AuthGate } from '@/components/auth/auth-gate';
import { Link } from '@/i18n/navigation';
import { MemberPayments } from '@/components/payments/member-payments';

// Member / donor area (F-30): membership fee, monthly donations, receipts.
export default function CotisationsPage() {
  const t = useTranslations('payments');
  return (
    <AuthGate className="max-w-md">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link
          href="/espace-membre"
          className="inline-block py-2 text-sm font-medium text-accent-text hover:underline"
        >
          {t('backToMemberArea')}
        </Link>
        <h1 className="mt-2 font-display text-3xl">{t('memberTitle')}</h1>
        <p className="mt-2 max-w-[60ch] text-ink-soft">{t('memberIntro')}</p>
        <div className="mt-8">
          <MemberPayments />
        </div>
      </div>
    </AuthGate>
  );
}

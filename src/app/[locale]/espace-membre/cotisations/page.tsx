'use client';

import { useTranslations } from 'next-intl';
import { AuthGate } from '@/components/auth/auth-gate';
import {
  MemberPageBody,
  MemberPageHeader,
} from '@/components/member/page-header';
import { MemberPayments } from '@/components/payments/member-payments';

// Member / donor area (F-30): membership fee, monthly donations, receipts.
export default function CotisationsPage() {
  const t = useTranslations('payments');
  return (
    <>
      <MemberPageHeader title={t('memberTitle')} lead={t('memberIntro')} />
      <MemberPageBody>
        <AuthGate>
          <MemberPayments />
        </AuthGate>
      </MemberPageBody>
    </>
  );
}

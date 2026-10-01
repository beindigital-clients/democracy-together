'use client';

import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { AuthGate } from '@/components/auth/auth-gate';
import { TwoFactorSettings } from '@/components/account/two-factor-settings';
import {
  MemberPageBody,
  MemberPageHeader,
} from '@/components/member/page-header';

// ACCOUNT SECURITY — two-factor authentication (accounts workstream).
//
// The only screen open to a staff account required to enrol its 2FA
// (`allowEnrollment`): the guard on every other screen sends it here.
function SecurityScreen() {
  const t = useTranslations('twoFactor');
  // `users.current` is null until the mandatory enrolment is done: the
  // address is only used to title the codes file, it can be missing
  // without blocking anything.
  const me = useQuery(api.users.current);
  return (
    <>
      <MemberPageHeader title={t('title')} lead={t('intro')} />
      <MemberPageBody narrow>
        <div className="rounded-md border border-line bg-surface p-5 shadow-card sm:p-6">
          <TwoFactorSettings email={me?.email ?? ''} />
        </div>
      </MemberPageBody>
    </>
  );
}

export default function SecuritePage() {
  return (
    <AuthGate allowEnrollment>
      <SecurityScreen />
    </AuthGate>
  );
}

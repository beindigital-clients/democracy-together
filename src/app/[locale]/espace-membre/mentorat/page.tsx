'use client';

import { AuthGate } from '@/components/auth/auth-gate';
import { useTranslations } from 'next-intl';
import { MentoringSpace } from '@/components/mentoring/mentoring-space';
import { MemberPageHeader, PAGE } from '@/components/programmes/shared';

// « Mon mentorat » (F-59) : profils mentor / mentoré et binômes.
function Page() {
  const t = useTranslations('mentorship');
  return (
    <div className={PAGE}>
      <MemberPageHeader title={t('spaceTitle')} lead={t('spaceLead')} />
      <MentoringSpace />
    </div>
  );
}

export default function MentoringSpacePage() {
  return (
    <AuthGate className="max-w-3xl">
      <Page />
    </AuthGate>
  );
}

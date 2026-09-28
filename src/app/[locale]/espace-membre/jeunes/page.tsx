'use client';

import { AuthGate } from '@/components/auth/auth-gate';
import { useTranslations } from 'next-intl';
import { YouthSpace } from '@/components/youth/youth-space';
import { MemberPageHeader, PAGE } from '@/components/programmes/shared';

// Youth area (F-58): persistent profile and applications to programmes.
function Page() {
  const t = useTranslations('youth');
  return (
    <div className={PAGE}>
      <MemberPageHeader title={t('spaceTitle')} lead={t('spaceLead')} />
      <YouthSpace />
    </div>
  );
}

export default function YouthSpacePage() {
  return (
    <AuthGate className="max-w-3xl">
      <Page />
    </AuthGate>
  );
}

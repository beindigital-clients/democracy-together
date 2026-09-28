'use client';

import { AuthGate } from '@/components/auth/auth-gate';
import { useTranslations } from 'next-intl';
import { MyCallApplications } from '@/components/projects/my-applications';
import { MemberPageHeader, PAGE } from '@/components/programmes/shared';

// Mes candidatures aux appels à projets (F-60).
function Page() {
  const t = useTranslations('projects');
  return (
    <div className={PAGE}>
      <MemberPageHeader
        title={t('memberSpaceTitle')}
        lead={t('memberSpaceLead')}
      />
      <MyCallApplications />
    </div>
  );
}

export default function MyProjectsPage() {
  return (
    <AuthGate className="max-w-3xl">
      <Page />
    </AuthGate>
  );
}

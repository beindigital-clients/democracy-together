'use client';

import { AuthGate } from '@/components/auth/auth-gate';
import { useTranslations } from 'next-intl';
import { EvaluationsBoard } from '@/components/projects/evaluations-board';
import { MemberPageHeader, PAGE } from '@/components/programmes/shared';

// Assigned evaluations (F-60). An appointed evaluator is a network member,
// not necessarily staff: the screen therefore lives in the member area, and
// it is the appointment (checked by Convex) that opens the files.
function Page() {
  const t = useTranslations('projects');
  return (
    <div className={PAGE}>
      <MemberPageHeader
        title={t('evaluationsTitle')}
        lead={t('evaluationsLead')}
      />
      <EvaluationsBoard />
    </div>
  );
}

export default function EvaluationsPage() {
  return (
    <AuthGate className="max-w-3xl">
      <Page />
    </AuthGate>
  );
}

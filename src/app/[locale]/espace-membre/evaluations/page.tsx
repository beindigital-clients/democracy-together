'use client';

import { AuthGate } from '@/components/auth/auth-gate';
import { useTranslations } from 'next-intl';
import { EvaluationsBoard } from '@/components/projects/evaluations-board';
import { MemberPageHeader, PAGE } from '@/components/programmes/shared';

// Évaluations confiées (F-60). Un évaluateur désigné est un membre du réseau,
// pas forcément du staff : l'écran vit donc dans l'espace membre, et c'est la
// désignation (vérifiée par Convex) qui ouvre les dossiers.
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

'use client';

import { useEffect } from 'react';
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from 'convex/react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { WorkspacesBoard } from '@/components/workspaces/workspaces-board';

function Loading() {
  const t = useTranslations('workspaces');
  return (
    <div className="mx-auto max-w-[960px] px-4 py-16 text-ink-soft sm:px-6">
      {t('loading')}
    </div>
  );
}

// Ne redirige que si l'état est *définitivement* non authentifié (jamais pendant
// le chargement) — même garde que l'espace membre / les notifications.
function RedirectToSignIn() {
  const router = useRouter();
  useEffect(() => {
    const id = setTimeout(() => router.replace('/connexion'), 1200);
    return () => clearTimeout(id);
  }, [router]);
  return <Loading />;
}

// Espaces de travail collaboratifs (F-24). Page gardée connecté ; le gating
// « membre réseau » est appliqué dans WorkspacesBoard (message dédié sinon).
export default function EspacesPage() {
  return (
    <>
      <AuthLoading>
        <Loading />
      </AuthLoading>
      <Unauthenticated>
        <RedirectToSignIn />
      </Unauthenticated>
      <Authenticated>
        <WorkspacesBoard />
      </Authenticated>
    </>
  );
}

'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from 'convex/react';
import { useTranslations } from 'next-intl';
import type { Id } from '@convex/_generated/dataModel';
import { useRouter } from '@/i18n/navigation';
import { WorkspaceDetail } from '@/components/workspaces/workspace-detail';

function Loading() {
  const t = useTranslations('workspaces');
  return (
    <div className="mx-auto max-w-[820px] px-4 py-16 text-ink-soft sm:px-6">
      {t('loading')}
    </div>
  );
}

function RedirectToSignIn() {
  const router = useRouter();
  useEffect(() => {
    const id = setTimeout(() => router.replace('/connexion'), 1200);
    return () => clearTimeout(id);
  }, [router]);
  return <Loading />;
}

function Detail() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) return <Loading />;
  return <WorkspaceDetail workspaceId={id as Id<'workspaces'>} />;
}

// Détail d'un espace de travail (F-24). Même garde que la liste : connecté
// requis, gating « membre réseau » appliqué dans WorkspaceDetail.
export default function EspaceDetailPage() {
  return (
    <>
      <AuthLoading>
        <Loading />
      </AuthLoading>
      <Unauthenticated>
        <RedirectToSignIn />
      </Unauthenticated>
      <Authenticated>
        <Detail />
      </Authenticated>
    </>
  );
}

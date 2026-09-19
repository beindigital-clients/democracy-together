'use client';

import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import { useParams } from 'next/navigation';
import type { Id } from '@convex/_generated/dataModel';
import { WorkspaceDetail } from '@/components/workspaces/workspace-detail';

function Detail() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) return <AuthGateLoading className="max-w-[820px]" />;
  return <WorkspaceDetail workspaceId={id as Id<'workspaces'>} />;
}

// Détail d'un espace de travail (F-24). Même garde que la liste : connecté
// requis, gating « membre réseau » appliqué dans WorkspaceDetail.
export default function EspaceDetailPage() {
  return (
    <AuthGate className="max-w-[820px]"><Detail /></AuthGate>
  );
}

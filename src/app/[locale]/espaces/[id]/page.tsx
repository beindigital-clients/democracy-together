'use client';

import { AuthGate, AuthGateLoading } from '@/components/auth/auth-gate';
import { useParams } from 'next/navigation';
import type { Id } from '@convex/_generated/dataModel';
import { WorkspaceDetail } from '@/components/workspaces/workspace-detail';

function Detail() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) return <AuthGateLoading />;
  return <WorkspaceDetail workspaceId={id as Id<'workspaces'>} />;
}

// Detail of a workspace (F-24). Same guard as the list: sign-in
// required, "network member" gating applied in WorkspaceDetail.
export default function EspaceDetailPage() {
  return (
    <AuthGate>
      <Detail />
    </AuthGate>
  );
}
